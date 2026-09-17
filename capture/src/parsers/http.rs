//! HTTP/1.x — recognizes a request line and pulls out method, path, and Host.
//! Deliberately does not attempt HTTP/2 (binary framing, needs the h2
//! preface + HPACK to make sense of, out of scope for a header sniff).

use super::{Context, ParsedInfo, Parser};

const METHODS: &[&str] = &["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH", "CONNECT"];

pub struct HttpParser;

impl Parser for HttpParser {
    fn name(&self) -> &'static str {
        "HTTP"
    }

    fn can_parse(&self, payload: &[u8], ctx: &Context) -> bool {
        if !ctx.is_tcp || payload.len() < 14 {
            return false;
        }
        let Ok(head) = std::str::from_utf8(&payload[..payload.len().min(16)]) else {
            return false;
        };
        METHODS.iter().any(|m| head.starts_with(&format!("{m} ")))
    }

    fn parse(&self, payload: &[u8], _ctx: &Context) -> Option<ParsedInfo> {
        let text = std::str::from_utf8(payload).ok()?;
        let request_line = text.lines().next()?;
        let mut parts = request_line.split_whitespace();
        let method = parts.next()?.to_string();
        let path = parts.next()?.to_string();

        let host = text
            .lines()
            .find(|l| l.to_ascii_lowercase().starts_with("host:"))
            .and_then(|l| l.split_once(':').map(|(_, v)| v.trim().to_string()));

        let detail = match &host {
            Some(h) => format!("{method} {path} (Host: {h})"),
            None => format!("{method} {path}"),
        };

        Some(ParsedInfo {
            protocol: "HTTP",
            detail,
            domain: host,
            method: Some(method),
            path: Some(path),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_get_request_with_host() {
        let raw = b"GET /login?user=admin HTTP/1.1\r\nHost: intranet.local\r\nUser-Agent: curl\r\n\r\n";
        let ctx = Context { src_port: 51000, dst_port: 80, is_tcp: true };
        assert!(HttpParser.can_parse(raw, &ctx));
        let info = HttpParser.parse(raw, &ctx).unwrap();
        assert_eq!(info.method.as_deref(), Some("GET"));
        assert_eq!(info.path.as_deref(), Some("/login?user=admin"));
        assert_eq!(info.domain.as_deref(), Some("intranet.local"));
    }

    #[test]
    fn rejects_non_http_payload() {
        let ctx = Context { src_port: 51000, dst_port: 443, is_tcp: true };
        assert!(!HttpParser.can_parse(&[0x16, 0x03, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], &ctx));
    }
}
