//! Live capture loop: opens a libpcap handle on an interface, and turns raw
//! Ethernet frames into `RawPacket`s (Ethernet → IPv4/IPv6 → TCP/UDP/ICMP),
//! by hand — no `pnet`, just the fixed byte layouts from RFC 791/8200/793/768.

use std::net::IpAddr;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::config::Config;

const ETHERTYPE_IPV4: u16 = 0x0800;
const ETHERTYPE_IPV6: u16 = 0x86DD;

const PROTO_ICMP: u8 = 1;
const PROTO_TCP: u8 = 6;
const PROTO_UDP: u8 = 17;
const PROTO_ICMPV6: u8 = 58;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Transport {
    Tcp,
    Udp,
    Icmp,
}

#[derive(Debug, Clone)]
pub struct RawPacket {
    pub src_ip: IpAddr,
    pub dst_ip: IpAddr,
    pub src_port: u16,
    pub dst_port: u16,
    pub transport: Transport,
    pub tcp_flags: u8,
    pub payload_len: usize,
    /// Transport-layer payload, capped to a few KB — enough for header
    /// sniffing (DNS/TLS ClientHello/HTTP request line/MQTT fixed header),
    /// not a full reassembly buffer.
    pub payload: Vec<u8>,
    pub timestamp_ms: u128,
}

/// Opens the interface named in `config` and calls `on_packet` for every
/// decodable IPv4/IPv6 + TCP/UDP/ICMP packet. Runs until the capture handle
/// errors out (interface down, process interrupted, ...).
pub fn run<F: FnMut(RawPacket)>(config: &Config, iface: &str, mut on_packet: F) -> Result<(), pcap::Error> {
    let mut cap = pcap::Capture::from_device(iface)?
        .promisc(true)
        .snaplen(65535)
        .timeout(1000)
        .immediate_mode(true)
        .open()?;

    if let Err(e) = cap.filter(&config.filter, true) {
        eprintln!("warning: BPF filter '{}' rejected ({e}), capturing unfiltered", config.filter);
    }

    loop {
        match cap.next_packet() {
            Ok(packet) => {
                if let Some(raw) = parse_ethernet_frame(packet.data) {
                    on_packet(raw);
                }
            }
            Err(pcap::Error::TimeoutExpired) => continue,
            Err(e) => return Err(e),
        }
    }
}

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

/// Ethernet II header is a fixed 14 bytes: dst mac(6) + src mac(6) + ethertype(2).
fn parse_ethernet_frame(data: &[u8]) -> Option<RawPacket> {
    if data.len() < 14 {
        return None;
    }
    let ethertype = u16::from_be_bytes([data[12], data[13]]);
    let ip_payload = &data[14..];

    match ethertype {
        ETHERTYPE_IPV4 => parse_ipv4(ip_payload),
        ETHERTYPE_IPV6 => parse_ipv6(ip_payload),
        _ => None, // ARP and friends carry no transport info to report
    }
}

fn parse_ipv4(data: &[u8]) -> Option<RawPacket> {
    if data.len() < 20 {
        return None;
    }
    let version = data[0] >> 4;
    if version != 4 {
        return None;
    }
    let ihl = (data[0] & 0x0f) as usize * 4;
    if ihl < 20 || data.len() < ihl {
        return None;
    }
    let protocol = data[9];
    let src_ip = IpAddr::from([data[12], data[13], data[14], data[15]]);
    let dst_ip = IpAddr::from([data[16], data[17], data[18], data[19]]);

    build_packet(protocol, src_ip, dst_ip, &data[ihl..])
}

/// IPv6 fixed header is 40 bytes. Extension headers (routing, fragment,
/// hop-by-hop, ...) are not walked — next_header is read straight from the
/// fixed header, which covers the overwhelming majority of live traffic.
fn parse_ipv6(data: &[u8]) -> Option<RawPacket> {
    if data.len() < 40 {
        return None;
    }
    let version = data[0] >> 4;
    if version != 6 {
        return None;
    }
    let next_header = data[6];
    let src_ip = IpAddr::from(<[u8; 16]>::try_from(&data[8..24]).ok()?);
    let dst_ip = IpAddr::from(<[u8; 16]>::try_from(&data[24..40]).ok()?);

    build_packet(next_header, src_ip, dst_ip, &data[40..])
}

fn build_packet(protocol: u8, src_ip: IpAddr, dst_ip: IpAddr, transport_data: &[u8]) -> Option<RawPacket> {
    const PAYLOAD_CAP: usize = 4096;

    match protocol {
        PROTO_TCP => {
            if transport_data.len() < 20 {
                return None;
            }
            let src_port = u16::from_be_bytes([transport_data[0], transport_data[1]]);
            let dst_port = u16::from_be_bytes([transport_data[2], transport_data[3]]);
            let data_offset = (transport_data[12] >> 4) as usize * 4;
            let tcp_flags = transport_data[13];
            let payload = transport_data.get(data_offset..).unwrap_or(&[]);
            let capped = &payload[..payload.len().min(PAYLOAD_CAP)];
            Some(RawPacket {
                src_ip,
                dst_ip,
                src_port,
                dst_port,
                transport: Transport::Tcp,
                tcp_flags,
                payload_len: payload.len(),
                payload: capped.to_vec(),
                timestamp_ms: now_ms(),
            })
        }
        PROTO_UDP => {
            if transport_data.len() < 8 {
                return None;
            }
            let src_port = u16::from_be_bytes([transport_data[0], transport_data[1]]);
            let dst_port = u16::from_be_bytes([transport_data[2], transport_data[3]]);
            let payload = &transport_data[8..];
            let capped = &payload[..payload.len().min(PAYLOAD_CAP)];
            Some(RawPacket {
                src_ip,
                dst_ip,
                src_port,
                dst_port,
                transport: Transport::Udp,
                tcp_flags: 0,
                payload_len: payload.len(),
                payload: capped.to_vec(),
                timestamp_ms: now_ms(),
            })
        }
        PROTO_ICMP | PROTO_ICMPV6 => Some(RawPacket {
            src_ip,
            dst_ip,
            src_port: 0,
            dst_port: 0,
            transport: Transport::Icmp,
            tcp_flags: 0,
            payload_len: transport_data.len(),
            payload: Vec::new(),
            timestamp_ms: now_ms(),
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn eth_ipv4_tcp(src_port: u16, dst_port: u16, flags: u8, payload: &[u8]) -> Vec<u8> {
        let mut tcp = vec![0u8; 20];
        tcp[0..2].copy_from_slice(&src_port.to_be_bytes());
        tcp[2..4].copy_from_slice(&dst_port.to_be_bytes());
        tcp[12] = 5 << 4; // data offset = 5 * 4 = 20 bytes, no options
        tcp[13] = flags;
        tcp.extend_from_slice(payload);

        let mut ip = vec![0u8; 20];
        ip[0] = 0x45; // version 4, IHL 5
        ip[9] = PROTO_TCP;
        ip[12..16].copy_from_slice(&[10, 0, 0, 1]);
        ip[16..20].copy_from_slice(&[10, 0, 0, 2]);
        ip.extend_from_slice(&tcp);

        let mut frame = vec![0u8; 12];
        frame.extend_from_slice(&ETHERTYPE_IPV4.to_be_bytes());
        frame.extend_from_slice(&ip);
        frame
    }

    #[test]
    fn decodes_ipv4_tcp_frame() {
        let frame = eth_ipv4_tcp(51000, 443, 0x02, b"hello");
        let pkt = parse_ethernet_frame(&frame).expect("should decode");
        assert_eq!(pkt.src_port, 51000);
        assert_eq!(pkt.dst_port, 443);
        assert_eq!(pkt.transport, Transport::Tcp);
        assert_eq!(pkt.tcp_flags, 0x02); // SYN
        assert_eq!(pkt.payload, b"hello");
        assert_eq!(format!("{}", pkt.src_ip), "10.0.0.1");
    }

    #[test]
    fn rejects_truncated_frame() {
        assert!(parse_ethernet_frame(&[0u8; 10]).is_none());
    }

    #[test]
    fn ignores_arp() {
        let mut frame = vec![0u8; 12];
        frame.extend_from_slice(&0x0806u16.to_be_bytes());
        frame.extend_from_slice(&[0u8; 28]);
        assert!(parse_ethernet_frame(&frame).is_none());
    }
}
