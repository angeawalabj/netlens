//! MQTT (v3.1.1 / v5 fixed header is unchanged) — decodes the fixed header
//! and, for PUBLISH and CONNECT packets, the fields useful for the anomaly
//! pipeline (topic, client id). Port is deliberately *not* part of
//! `can_parse`: recognizing MQTT on an unexpected port is exactly what lets
//! `pipeline::rule_mqtt_unknown_broker` do its job.

use super::{Context, ParsedInfo, Parser};

const CONNECT: u8 = 1;
const PUBLISH: u8 = 3;
const SUBSCRIBE: u8 = 8;
const PINGREQ: u8 = 12;
const PINGRESP: u8 = 13;
const DISCONNECT: u8 = 14;

pub struct MqttParser;

impl Parser for MqttParser {
    fn name(&self) -> &'static str {
        "MQTT"
    }

    fn can_parse(&self, payload: &[u8], ctx: &Context) -> bool {
        if !ctx.is_tcp || payload.is_empty() {
            return false;
        }
        let packet_type = payload[0] >> 4;
        if !(1..=14).contains(&packet_type) {
            return false;
        }
        decode_remaining_length(payload, 1).is_some()
    }

    fn parse(&self, payload: &[u8], _ctx: &Context) -> Option<ParsedInfo> {
        let packet_type = payload[0] >> 4;
        let qos = (payload[0] & 0x06) >> 1;
        let (remaining_len, len_bytes) = decode_remaining_length(payload, 1)?;
        let body_start = 1 + len_bytes;
        let body_end = (body_start + remaining_len).min(payload.len());
        let body = payload.get(body_start..body_end)?;

        match packet_type {
            PUBLISH => {
                let (topic, after_topic) = read_utf8_string(body, 0)?;
                let _packet_id_len = if qos > 0 { 2 } else { 0 };
                let _ = after_topic; // payload bytes beyond topic/id are opaque
                Some(ParsedInfo {
                    protocol: "MQTT",
                    detail: format!("PUBLISH topic={topic} qos={qos}"),
                    domain: Some(topic),
                    method: Some("PUBLISH".into()),
                    path: None,
                })
            }
            CONNECT => {
                let (proto_name, after_name) = read_utf8_string(body, 0)?;
                let client_id = body
                    .get(after_name + 4..) // proto level(1) + connect flags(1) + keepalive(2)
                    .and_then(|rest| read_utf8_string(rest, 0).map(|(id, _)| id));
                Some(ParsedInfo {
                    protocol: "MQTT",
                    detail: format!(
                        "CONNECT proto={proto_name} client={}",
                        client_id.as_deref().unwrap_or("?")
                    ),
                    domain: None,
                    method: Some("CONNECT".into()),
                    path: None,
                })
            }
            SUBSCRIBE => Some(ParsedInfo {
                protocol: "MQTT",
                detail: "SUBSCRIBE".into(),
                domain: None,
                method: Some("SUBSCRIBE".into()),
                path: None,
            }),
            PINGREQ => Some(simple("PINGREQ")),
            PINGRESP => Some(simple("PINGRESP")),
            DISCONNECT => Some(simple("DISCONNECT")),
            other => Some(simple(&format!("packet type {other}"))),
        }
    }
}

fn simple(label: &str) -> ParsedInfo {
    ParsedInfo {
        protocol: "MQTT",
        detail: label.to_string(),
        domain: None,
        method: Some(label.to_string()),
        path: None,
    }
}

/// MQTT variable-length "Remaining Length" encoding: up to 4 bytes, each
/// contributing 7 bits, continuation signaled by the top bit.
fn decode_remaining_length(buf: &[u8], start: usize) -> Option<(usize, usize)> {
    let mut multiplier = 1usize;
    let mut value = 0usize;
    let mut i = 0;

    loop {
        let byte = *buf.get(start + i)?;
        value += (byte & 0x7f) as usize * multiplier;
        i += 1;
        if byte & 0x80 == 0 {
            return Some((value, i));
        }
        multiplier *= 128;
        if i >= 4 {
            return None; // malformed: more than 4 continuation bytes
        }
    }
}

/// Reads an MQTT UTF-8 string: 2-byte big-endian length, then bytes.
/// Returns the string and the offset in `buf` just past it (as `impl Trait`
/// callers can `?` on the `Result` form via `.ok()`).
fn read_utf8_string(buf: &[u8], offset: usize) -> Option<(String, usize)> {
    let len = u16::from_be_bytes([*buf.get(offset)?, *buf.get(offset + 1)?]) as usize;
    let start = offset + 2;
    let bytes = buf.get(start..start + len)?;
    Some((String::from_utf8_lossy(bytes).into_owned(), start + len))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn publish_packet(topic: &str, payload: &[u8], qos: u8) -> Vec<u8> {
        let mut var_header = Vec::new();
        var_header.extend_from_slice(&(topic.len() as u16).to_be_bytes());
        var_header.extend_from_slice(topic.as_bytes());
        if qos > 0 {
            var_header.extend_from_slice(&1u16.to_be_bytes()); // packet id
        }
        var_header.extend_from_slice(payload);

        let mut pkt = vec![(PUBLISH << 4) | (qos << 1)];
        pkt.extend(encode_remaining_length(var_header.len()));
        pkt.extend(var_header);
        pkt
    }

    fn encode_remaining_length(mut len: usize) -> Vec<u8> {
        let mut out = Vec::new();
        loop {
            let mut byte = (len % 128) as u8;
            len /= 128;
            if len > 0 {
                byte |= 0x80;
            }
            out.push(byte);
            if len == 0 {
                break;
            }
        }
        out
    }

    #[test]
    fn parses_publish_topic() {
        let pkt = publish_packet("sensors/kitchen/temp", b"21.5", 0);
        let ctx = Context { src_port: 51000, dst_port: 1883, is_tcp: true };
        assert!(MqttParser.can_parse(&pkt, &ctx));
        let info = MqttParser.parse(&pkt, &ctx).unwrap();
        assert_eq!(info.domain.as_deref(), Some("sensors/kitchen/temp"));
    }

    #[test]
    fn recognizes_mqtt_on_nonstandard_port() {
        // can_parse must not gate on port — that's the anomaly engine's job.
        let pkt = publish_packet("x", b"y", 0);
        let ctx = Context { src_port: 51000, dst_port: 51413, is_tcp: true };
        assert!(MqttParser.can_parse(&pkt, &ctx));
    }

    #[test]
    fn pingreq_has_no_topic() {
        let pkt = vec![PINGREQ << 4, 0x00];
        let ctx = Context { src_port: 51000, dst_port: 1883, is_tcp: true };
        let info = MqttParser.parse(&pkt, &ctx).unwrap();
        assert_eq!(info.detail, "PINGREQ");
    }
}
