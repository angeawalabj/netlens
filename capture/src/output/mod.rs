//! WebSocket output: the JSON event protocol documented in
//! `docs/architecture.md`, and a minimal hand-rolled WebSocket server
//! (handshake + unmasked server→client text frames) to ship it — no tokio,
//! no tungstenite, just `std::net` and RFC 6455.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;

use crate::pipeline::Flow;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum Event {
    Status {
        status: String,
    },
    DeviceList {
        devices: Vec<Device>,
    },
    FlowUpdate {
        flows: Vec<Flow>,
    },
    BandwidthSample {
        #[serde(rename = "mbpsDown")]
        mbps_down: f64,
        #[serde(rename = "mbpsUp")]
        mbps_up: f64,
        timestamp: u128,
    },
    Alert {
        severity: String,
        #[serde(rename = "flowId")]
        flow_id: String,
        title: String,
        description: String,
        timestamp: u128,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct Device {
    pub ip: String,
    pub bytes: u64,
    pub flows: usize,
}

/// Devices aren't ARP-discovered — they're inferred from who's originating
/// flows. Good enough to populate the dashboard's device list without a
/// separate discovery pass.
pub fn devices_from_flows(flows: &[Flow]) -> Vec<Device> {
    let mut by_ip: HashMap<&str, Device> = HashMap::new();
    for flow in flows {
        let entry = by_ip.entry(flow.src_ip.as_str()).or_insert_with(|| Device {
            ip: flow.src_ip.clone(),
            bytes: 0,
            flows: 0,
        });
        entry.bytes += flow.bytes;
        entry.flows += 1;
    }
    let mut devices: Vec<Device> = by_ip.into_values().collect();
    devices.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    devices
}

// ─── WebSocket server ───────────────────────────────────────────────────

const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

pub struct WsServer {
    clients: Arc<Mutex<Vec<TcpStream>>>,
}

impl WsServer {
    pub fn start(port: u16) -> std::io::Result<Self> {
        let listener = TcpListener::bind(("0.0.0.0", port))?;
        let clients: Arc<Mutex<Vec<TcpStream>>> = Arc::new(Mutex::new(Vec::new()));
        let accept_clients = Arc::clone(&clients);

        thread::spawn(move || {
            for incoming in listener.incoming() {
                let Ok(mut stream) = incoming else { continue };
                match perform_handshake(&mut stream) {
                    Ok(()) => {
                        let status = Event::Status { status: "connected".into() };
                        if let Ok(json) = serde_json::to_vec(&status) {
                            let _ = stream.write_all(&encode_text_frame(&json));
                        }
                        if let Ok(mut guard) = accept_clients.lock() {
                            guard.push(stream);
                            println!("[ws] client connected ({} total)", guard.len());
                        }
                    }
                    Err(e) => eprintln!("[ws] handshake failed: {e}"),
                }
            }
        });

        Ok(WsServer { clients })
    }

    /// Sends `event` to every currently connected client, dropping any
    /// connection that errors on write (client disconnected).
    pub fn broadcast(&self, event: &Event) {
        let Ok(json) = serde_json::to_vec(event) else { return };
        let frame = encode_text_frame(&json);
        if let Ok(mut guard) = self.clients.lock() {
            guard.retain_mut(|client| client.write_all(&frame).is_ok());
        }
    }

    pub fn client_count(&self) -> usize {
        self.clients.lock().map(|g| g.len()).unwrap_or(0)
    }
}

fn perform_handshake(stream: &mut TcpStream) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut key: Option<String> = None;
    let mut line = String::new();

    loop {
        line.clear();
        let n = reader.read_line(&mut line)?;
        if n == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("sec-websocket-key") {
                key = Some(value.trim().to_string());
            }
        }
    }

    let key = key.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "missing Sec-WebSocket-Key header")
    })?;

    let response = format!(
        "HTTP/1.1 101 Switching Protocols\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Accept: {}\r\n\r\n",
        accept_key(&key)
    );
    stream.write_all(response.as_bytes())
}

fn accept_key(client_key: &str) -> String {
    let mut combined = Vec::with_capacity(client_key.len() + WS_GUID.len());
    combined.extend_from_slice(client_key.as_bytes());
    combined.extend_from_slice(WS_GUID.as_bytes());
    STANDARD.encode(sha1(&combined))
}

/// Encodes an unmasked server→client text frame (RFC 6455 §5.2). Server
/// frames must not be masked — only client→server frames are.
fn encode_text_frame(payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(payload.len() + 10);
    frame.push(0x81); // FIN=1, opcode=0x1 (text)
    let len = payload.len();
    if len <= 125 {
        frame.push(len as u8);
    } else if len <= 0xFFFF {
        frame.push(126);
        frame.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        frame.push(127);
        frame.extend_from_slice(&(len as u64).to_be_bytes());
    }
    frame.extend_from_slice(payload);
    frame
}

/// Minimal SHA-1 (FIPS 180-1). The WebSocket handshake requires SHA-1
/// specifically per RFC 6455 §1.3 — this exists for that alone, never for
/// anything where collision resistance matters.
fn sha1(input: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];

    let bit_len = (input.len() as u64) * 8;
    let mut msg = input.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks(64) {
        let mut w = [0u32; 80];
        for (i, word) in chunk.chunks(4).enumerate() {
            w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let [mut a, mut b, mut c, mut d, mut e] = h;

        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1u32),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDCu32),
                _ => (b ^ c ^ d, 0xCA62C1D6u32),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
    }

    let mut out = [0u8; 20];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha1_matches_known_vector() {
        // FIPS 180-1 test vector: SHA1("abc")
        let digest = sha1(b"abc");
        assert_eq!(
            digest,
            [
                0xa9, 0x99, 0x3e, 0x36, 0x47, 0x06, 0x81, 0x6a, 0xba, 0x3e, 0x25, 0x71, 0x78, 0x50,
                0xc2, 0x6c, 0x9c, 0xd0, 0xd8, 0x9d
            ]
        );
    }

    #[test]
    fn sha1_matches_known_vector_empty_string() {
        let digest = sha1(b"");
        assert_eq!(
            digest,
            [
                0xda, 0x39, 0xa3, 0xee, 0x5e, 0x6b, 0x4b, 0x0d, 0x32, 0x55, 0xbf, 0xef, 0x95, 0x60,
                0x18, 0x90, 0xaf, 0xd8, 0x07, 0x09
            ]
        );
    }

    #[test]
    fn accept_key_matches_rfc6455_example() {
        // RFC 6455 §1.3 worked example
        assert_eq!(accept_key("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    }

    #[test]
    fn text_frame_uses_extended_length_for_large_payloads() {
        let payload = vec![0u8; 200];
        let frame = encode_text_frame(&payload);
        assert_eq!(frame[0], 0x81);
        assert_eq!(frame[1], 126);
    }

    #[test]
    fn devices_from_flows_aggregates_by_source() {
        let flows = vec![
            Flow {
                id: "a".into(),
                src_ip: "10.0.0.5".into(),
                dst_ip: "1.1.1.1".into(),
                src_port: 1,
                dst_port: 2,
                transport: "TCP",
                protocol: None,
                detail: None,
                bytes: 100,
                packets: 1,
                first_seen_ms: 0,
                last_seen_ms: 0,
            },
            Flow {
                id: "b".into(),
                src_ip: "10.0.0.5".into(),
                dst_ip: "8.8.8.8".into(),
                src_port: 1,
                dst_port: 3,
                transport: "TCP",
                protocol: None,
                detail: None,
                bytes: 50,
                packets: 1,
                first_seen_ms: 0,
                last_seen_ms: 0,
            },
        ];
        let devices = devices_from_flows(&flows);
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].bytes, 150);
        assert_eq!(devices[0].flows, 2);
    }
}
