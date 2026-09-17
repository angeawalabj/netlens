//! netlens-capture — live packet capture engine.
//!
//! Captures traffic on a network interface via libpcap, classifies flows
//! by application protocol (DNS/TLS/HTTP/MQTT), runs anomaly rules over
//! them, and streams the results as JSON over a hand-rolled WebSocket
//! server. The NetLens X-Ray dashboard is the intended client, but the
//! protocol (see docs/architecture.md) is just JSON-over-WebSocket — any
//! client can connect.

mod capture;
mod config;
mod output;
mod parsers;
mod pipeline;

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use config::Config;
use output::{Event, WsServer};
use pipeline::FlowRegistry;

const FLOW_IDLE_TIMEOUT_MS: u128 = 60_000;
const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(1);

fn main() {
    let config = Config::from_args(std::env::args());

    if config.list_interfaces {
        list_interfaces();
        return;
    }

    let iface = match config.resolve_interface() {
        Ok(name) => name,
        Err(e) => {
            eprintln!("error: could not resolve a capture interface ({e})");
            eprintln!("hint: pass --interface <name>, or --list-interfaces to see what's available");
            std::process::exit(1);
        }
    };

    println!("netlens-capture — interface={iface} filter=\"{}\"", config.filter);

    let ws = match WsServer::start(config.port) {
        Ok(server) => Arc::new(server),
        Err(e) => {
            eprintln!("error: could not start WebSocket server on port {} ({e})", config.port);
            std::process::exit(1);
        }
    };
    println!("netlens-capture — streaming on ws://0.0.0.0:{}", config.port);

    let registry = Arc::new(Mutex::new(FlowRegistry::new()));

    {
        let registry = Arc::clone(&registry);
        let config = config.clone();
        let iface = iface.clone();
        thread::spawn(move || {
            let result = capture::run(&config, &iface, |pkt| {
                if let Ok(mut reg) = registry.lock() {
                    reg.ingest(&pkt);
                }
            });
            if let Err(e) = result {
                eprintln!("error: capture loop stopped ({e})");
                eprintln!("hint: capture usually needs elevated privileges — see README (setcap/sudo)");
                std::process::exit(1);
            }
        });
    }

    run_snapshot_loop(&registry, &ws, &config.watch_prefixes);
}

/// Every second: expire idle flows, push a FlowUpdate + BandwidthSample +
/// DeviceList snapshot, and broadcast any newly-triggered anomaly alerts
/// (deduplicated per flow+rule so a persistent condition doesn't spam).
fn run_snapshot_loop(registry: &Arc<Mutex<FlowRegistry>>, ws: &Arc<WsServer>, watch_prefixes: &[String]) {
    let mut already_alerted: HashSet<String> = HashSet::new();
    let mut last_total_bytes: u64 = 0;

    loop {
        thread::sleep(SNAPSHOT_INTERVAL);

        let flows = {
            let mut reg = match registry.lock() {
                Ok(r) => r,
                Err(_) => continue,
            };
            reg.expire(FLOW_IDLE_TIMEOUT_MS);
            reg.snapshot()
        };

        let total_bytes: u64 = flows.iter().map(|f| f.bytes).sum();
        let delta_bytes = total_bytes.saturating_sub(last_total_bytes);
        last_total_bytes = total_bytes;
        let mbps_down = (delta_bytes as f64 * 8.0) / 1_000_000.0 / SNAPSHOT_INTERVAL.as_secs_f64();

        ws.broadcast(&Event::DeviceList { devices: output::devices_from_flows(&flows) });
        ws.broadcast(&Event::FlowUpdate { flows: flows.clone() });
        ws.broadcast(&Event::BandwidthSample { mbps_down, mbps_up: 0.0, timestamp: now_ms() });

        let mut alerts = pipeline::scan_flows(&flows);
        if !watch_prefixes.is_empty() {
            alerts.extend(flows.iter().filter_map(|f| pipeline::rule_suspicious_destination(f, watch_prefixes)));
        }
        for alert in alerts {
            let dedup_key = format!("{}::{}", alert.flow_id, alert.title);
            if already_alerted.insert(dedup_key) {
                ws.broadcast(&Event::Alert {
                    severity: alert.severity.to_string(),
                    flow_id: alert.flow_id,
                    title: alert.title,
                    description: alert.description,
                    timestamp: alert.timestamp_ms,
                });
            }
        }

        if flows.is_empty() && ws.client_count() == 0 {
            // Nothing to report and nobody listening — no-op tick.
            continue;
        }
    }
}

fn list_interfaces() {
    match pcap::Device::list() {
        Ok(devices) => {
            for d in devices {
                let desc = d.desc.unwrap_or_else(|| "(no description)".into());
                let up = if d.flags.is_up() { "up" } else { "down" };
                println!("{:<12} {up:<6} {desc}", d.name);
            }
        }
        Err(e) => {
            eprintln!("error: could not list interfaces ({e})");
            std::process::exit(1);
        }
    }
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}
