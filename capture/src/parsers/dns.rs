//! DNS (RFC 1035) — parses just enough of the header and question section
//! to report what name was being resolved.

use super::{Context, ParsedInfo, Parser};

const HEADER_LEN: usize = 12;
const MAX_LABEL_HOPS: usize = 32; // guards against pointer loops in hostile input

pub struct DnsParser;

impl Parser for DnsParser {
    fn name(&self) -> &'static str {
        "DNS"
    }

    fn can_parse(&self, payload: &[u8], ctx: &Context) -> bool {
        !ctx.is_tcp
            && (ctx.src_port == 53 || ctx.dst_port == 53)
            && payload.len() >= HEADER_LEN
    }

    fn parse(&self, payload: &[u8], _ctx: &Context) -> Option<ParsedInfo> {
        let flags = u16::from_be_bytes([payload[2], payload[3]]);
        let is_response = flags & 0x8000 != 0;
        let rcode = flags & 0x000f;
        let qdcount = u16::from_be_bytes([payload[4], payload[5]]);

        if qdcount == 0 {
            return Some(ParsedInfo {
                protocol: "DNS",
                detail: if is_response { "response, no question section".into() } else { "query, no question section".into() },
                domain: None,
                method: None,
                path: None,
            });
        }

        let (name, next) = read_name(payload, HEADER_LEN)?;
        let qtype = payload.get(next..next + 2).map(|b| u16::from_be_bytes([b[0], b[1]]));

        let detail = match (is_response, rcode) {
            (false, _) => format!("query {}", qtype_name(qtype)),
            (true, 3) => "response NXDOMAIN".to_string(),
            (true, 0) => format!("response OK {}", qtype_name(qtype)),
            (true, code) => format!("response error (RCODE {code})"),
        };

        Some(ParsedInfo {
            protocol: "DNS",
            detail,
            domain: Some(name),
            method: None,
            path: None,
        })
    }
}

fn qtype_name(qtype: Option<u16>) -> &'static str {
    match qtype {
        Some(1) => "A",
        Some(28) => "AAAA",
        Some(5) => "CNAME",
        Some(15) => "MX",
        Some(16) => "TXT",
        Some(2) => "NS",
        Some(6) => "SOA",
        Some(33) => "SRV",
        _ => "?",
    }
}

/// Reads a wire-format DNS name starting at `offset`, following compression
/// pointers (RFC 1035 §4.1.4). Returns the dotted name and the offset just
/// past the name *in the original, non-pointer-followed stream* (pointer
/// follows don't advance the caller's cursor).
fn read_name(buf: &[u8], offset: usize) -> Option<(String, usize)> {
    let mut labels: Vec<String> = Vec::new();
    let mut pos = offset;
    let mut end_of_name: Option<usize> = None;
    let mut hops = 0;

    loop {
        let len = *buf.get(pos)?;

        if len == 0 {
            if end_of_name.is_none() {
                end_of_name = Some(pos + 1);
            }
            break;
        }

        if len & 0xc0 == 0xc0 {
            // Compression pointer: 14-bit offset from the two low bits of
            // this byte plus the next byte.
            let hi = (len & 0x3f) as usize;
            let lo = *buf.get(pos + 1)? as usize;
            if end_of_name.is_none() {
                end_of_name = Some(pos + 2);
            }
            hops += 1;
            if hops > MAX_LABEL_HOPS {
                return None;
            }
            pos = (hi << 8) | lo;
            continue;
        }

        let len = len as usize;
        let start = pos + 1;
        let label = buf.get(start..start + len)?;
        labels.push(String::from_utf8_lossy(label).into_owned());
        pos = start + len;
    }

    Some((labels.join("."), end_of_name.unwrap_or(pos)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dns_query(name: &str, qtype: u16) -> Vec<u8> {
        let mut buf = vec![
            0x12, 0x34, // ID
            0x01, 0x00, // flags: standard query
            0x00, 0x01, // QDCOUNT = 1
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        for label in name.split('.') {
            buf.push(label.len() as u8);
            buf.extend_from_slice(label.as_bytes());
        }
        buf.push(0x00);
        buf.extend_from_slice(&qtype.to_be_bytes());
        buf.extend_from_slice(&1u16.to_be_bytes()); // QCLASS = IN
        buf
    }

    #[test]
    fn parses_a_record_query() {
        let payload = dns_query("example.com", 1);
        let ctx = Context { src_port: 51000, dst_port: 53, is_tcp: false };
        let parser = DnsParser;
        assert!(parser.can_parse(&payload, &ctx));
        let info = parser.parse(&payload, &ctx).unwrap();
        assert_eq!(info.domain.as_deref(), Some("example.com"));
        assert!(info.detail.contains('A'));
    }

    #[test]
    fn rejects_short_payload() {
        let ctx = Context { src_port: 53, dst_port: 51000, is_tcp: false };
        assert!(!DnsParser.can_parse(&[0u8; 4], &ctx));
    }
}
