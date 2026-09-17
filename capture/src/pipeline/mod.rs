//! Flow tracking and anomaly detection. Every packet the capture loop
//! decodes gets folded into a `Flow` (keyed on the 5-tuple); each flow is
//! re-classified as new payload arrives, and the anomaly rules run over the
//! resulting flow table.

use std::collections::HashMap;
use std::net::IpAddr;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::capture::{RawPacket, Transport};
use crate::parsers::{Context as ParseContext, ParserRegistry};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct FlowKey {
    src_ip: IpAddr,
    dst_ip: IpAddr,
    src_port: u16,
    dst_port: u16,
    transport: Transport,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Flow {
    pub id: String,
    pub src_ip: String,
    pub dst_ip: String,
    pub src_port: u16,
    pub dst_port: u16,
    pub transport: &'static str,
    pub protocol: Option<String>,
    pub detail: Option<String>,
    pub bytes: u64,
    pub packets: u64,
    pub first_seen_ms: u128,
    pub last_seen_ms: u128,
}

impl Flow {
    fn new(key: &FlowKey, now: u128) -> Self {
        Flow {
            id: format!(
                "{}:{}-{}:{}/{}",
                key.src_ip, key.src_port, key.dst_ip, key.dst_port, transport_name(key.transport)
            ),
            src_ip: key.src_ip.to_string(),
            dst_ip: key.dst_ip.to_string(),
            src_port: key.src_port,
            dst_port: key.dst_port,
            transport: transport_name(key.transport),
            protocol: None,
            detail: None,
            bytes: 0,
            packets: 0,
            first_seen_ms: now,
            last_seen_ms: now,
        }
    }
}

fn transport_name(t: Transport) -> &'static str {
    match t {
        Transport::Tcp => "TCP",
        Transport::Udp => "UDP",
        Transport::Icmp => "ICMP",
    }
}

pub struct FlowRegistry {
    flows: HashMap<FlowKey, Flow>,
    parsers: ParserRegistry,
}

impl FlowRegistry {
    pub fn new() -> Self {
        FlowRegistry { flows: HashMap::new(), parsers: ParserRegistry::new() }
    }

    /// Folds a decoded packet into its flow, running protocol identification
    /// once per flow (the first payload-bearing packet usually carries
    /// enough to classify — a DNS query, a TLS ClientHello, an HTTP request
    /// line, an MQTT CONNECT/PUBLISH).
    pub fn ingest(&mut self, pkt: &RawPacket) {
        let key = FlowKey {
            src_ip: pkt.src_ip,
            dst_ip: pkt.dst_ip,
            src_port: pkt.src_port,
            dst_port: pkt.dst_port,
            transport: pkt.transport,
        };
        let now = pkt.timestamp_ms;
        let flow = self.flows.entry(key.clone()).or_insert_with(|| Flow::new(&key, now));

        flow.bytes += pkt.payload_len as u64;
        flow.packets += 1;
        flow.last_seen_ms = now;

        if flow.protocol.is_none() && !pkt.payload.is_empty() {
            let ctx = ParseContext {
                src_port: pkt.src_port,
                dst_port: pkt.dst_port,
                is_tcp: pkt.transport == Transport::Tcp,
            };
            if let Some(info) = self.parsers.identify(&pkt.payload, &ctx) {
                flow.protocol = Some(info.protocol.to_string());
                flow.detail = Some(info.detail);
            }
        }
    }

    /// Drops flows that haven't seen a packet in `idle_ms`.
    pub fn expire(&mut self, idle_ms: u128) {
        let now = now_ms();
        self.flows.retain(|_, f| now.saturating_sub(f.last_seen_ms) < idle_ms);
    }

    pub fn snapshot(&self) -> Vec<Flow> {
        let mut flows: Vec<Flow> = self.flows.values().cloned().collect();
        flows.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        flows
    }

    pub fn len(&self) -> usize {
        self.flows.len()
    }
}

impl Default for FlowRegistry {
    fn default() -> Self {
        Self::new()
    }
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

// ─── Anomaly detection ──────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct Alert {
    pub severity: &'static str,
    pub flow_id: String,
    pub title: String,
    pub description: String,
    pub timestamp_ms: u128,
}

const HIGH_VOLUME_THRESHOLD_BYTES: u64 = 50 * 1024 * 1024;
const KNOWN_MQTT_BROKER_PORTS: &[u16] = &[1883, 8883];
const CLEARTEXT_KEYWORDS: &[&str] = &["password", "token", "login", "session", "apikey", "api_key", "secret"];

/// Flags flows moving a lot of data under a protocol we couldn't identify —
/// large unclassified transfers are exactly the shape of exfiltration or a
/// misconfigured service nobody remembers is exposed.
pub fn rule_high_volume_unclassified(flow: &Flow) -> Option<Alert> {
    if flow.protocol.is_none() && flow.bytes > HIGH_VOLUME_THRESHOLD_BYTES {
        return Some(Alert {
            severity: "warning",
            flow_id: flow.id.clone(),
            title: "High-volume unclassified transfer".into(),
            description: format!(
                "{} → {}:{} moved {} bytes over {} with no recognized application protocol",
                flow.src_ip, flow.dst_ip, flow.dst_port, flow.bytes, flow.transport
            ),
            timestamp_ms: flow.last_seen_ms,
        });
    }
    None
}

/// MQTT is meant to run against a known broker. MQTT traffic to a port
/// outside the standard/TLS pair is either a misconfigured device or
/// something tunneling through a broker-shaped protocol on a random port.
pub fn rule_mqtt_unknown_broker(flow: &Flow) -> Option<Alert> {
    if flow.protocol.as_deref() == Some("MQTT") && !KNOWN_MQTT_BROKER_PORTS.contains(&flow.dst_port) {
        return Some(Alert {
            severity: "warning",
            flow_id: flow.id.clone(),
            title: "MQTT to non-standard broker port".into(),
            description: format!(
                "MQTT traffic to {}:{} — expected {:?}",
                flow.dst_ip, flow.dst_port, KNOWN_MQTT_BROKER_PORTS
            ),
            timestamp_ms: flow.last_seen_ms,
        });
    }
    None
}

/// Plaintext HTTP carrying a path that looks like it's handling credentials
/// (login, token, session, ...). It's a heuristic, not proof — but cleartext
/// credential-shaped paths are worth a human's attention.
pub fn rule_cleartext_credentials(flow: &Flow) -> Option<Alert> {
    if flow.protocol.as_deref() != Some("HTTP") {
        return None;
    }
    let detail = flow.detail.as_deref().unwrap_or("");
    let lower = detail.to_ascii_lowercase();
    if CLEARTEXT_KEYWORDS.iter().any(|kw| lower.contains(kw)) {
        return Some(Alert {
            severity: "critical",
            flow_id: flow.id.clone(),
            title: "Cleartext HTTP with sensitive path keywords".into(),
            description: format!("{} → {} ({})", flow.src_ip, flow.dst_ip, detail),
            timestamp_ms: flow.last_seen_ms,
        });
    }
    None
}

/// Flags traffic to a destination matching one of the operator-configured
/// prefixes (e.g. address ranges for regions or ASNs the operator wants
/// watched). Empty by default — this rule is inert until `--watch-prefix`
/// is passed, unlike the other three which need no configuration.
pub fn rule_suspicious_destination(flow: &Flow, watched_prefixes: &[String]) -> Option<Alert> {
    let matched = watched_prefixes.iter().find(|prefix| flow.dst_ip.starts_with(prefix.as_str()))?;
    Some(Alert {
        severity: "warning",
        flow_id: flow.id.clone(),
        title: "Traffic to watched destination range".into(),
        description: format!(
            "{} → {}:{} matches watched prefix '{matched}'",
            flow.src_ip, flow.dst_ip, flow.dst_port
        ),
        timestamp_ms: flow.last_seen_ms,
    })
}

pub const RULES: &[fn(&Flow) -> Option<Alert>] = &[
    rule_high_volume_unclassified,
    rule_mqtt_unknown_broker,
    rule_cleartext_credentials,
];

pub fn scan_flow(flow: &Flow) -> Vec<Alert> {
    RULES.iter().filter_map(|rule| rule(flow)).collect()
}

pub fn scan_flows(flows: &[Flow]) -> Vec<Alert> {
    flows.iter().flat_map(scan_flow).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_flow() -> Flow {
        Flow {
            id: "test-flow".into(),
            src_ip: "10.0.0.5".into(),
            dst_ip: "203.0.113.9".into(),
            src_port: 51000,
            dst_port: 1883,
            transport: "TCP",
            protocol: None,
            detail: None,
            bytes: 0,
            packets: 0,
            first_seen_ms: 0,
            last_seen_ms: 0,
        }
    }

    #[test]
    fn clean_flow_triggers_nothing() {
        let mut flow = base_flow();
        flow.protocol = Some("TLS".into());
        flow.bytes = 1024;
        assert!(scan_flow(&flow).is_empty());
    }

    #[test]
    fn high_volume_unclassified_triggers() {
        let mut flow = base_flow();
        flow.bytes = 100 * 1024 * 1024;
        let alerts = scan_flow(&flow);
        assert!(alerts.iter().any(|a| a.title.contains("High-volume")));
    }

    #[test]
    fn mqtt_unknown_broker_triggers() {
        let mut flow = base_flow();
        flow.protocol = Some("MQTT".into());
        flow.dst_port = 51413;
        let alerts = scan_flow(&flow);
        assert!(alerts.iter().any(|a| a.title.contains("MQTT")));
    }

    #[test]
    fn mqtt_standard_broker_is_silent() {
        let mut flow = base_flow();
        flow.protocol = Some("MQTT".into());
        flow.dst_port = 1883;
        assert!(scan_flow(&flow).is_empty());
    }

    #[test]
    fn cleartext_credentials_trigger() {
        let mut flow = base_flow();
        flow.protocol = Some("HTTP".into());
        flow.detail = Some("POST /login (Host: intranet.local)".into());
        let alerts = scan_flow(&flow);
        assert!(alerts.iter().any(|a| a.severity == "critical"));
    }

    #[test]
    fn suspicious_destination_matches_configured_prefix() {
        let mut flow = base_flow();
        flow.dst_ip = "203.0.113.42".into();
        let watched = vec!["203.0.113.".to_string()];
        assert!(rule_suspicious_destination(&flow, &watched).is_some());
        assert!(rule_suspicious_destination(&flow, &[]).is_none());
    }

    #[test]
    fn flow_registry_ingests_and_expires() {
        let mut registry = FlowRegistry::new();
        let pkt = RawPacket {
            src_ip: "10.0.0.1".parse().unwrap(),
            dst_ip: "10.0.0.2".parse().unwrap(),
            src_port: 51000,
            dst_port: 443,
            transport: Transport::Tcp,
            tcp_flags: 0,
            payload_len: 5,
            payload: b"hello".to_vec(),
            timestamp_ms: 1000,
        };
        registry.ingest(&pkt);
        assert_eq!(registry.len(), 1);
        assert_eq!(registry.snapshot()[0].bytes, 5);
    }
}
