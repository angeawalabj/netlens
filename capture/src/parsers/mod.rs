//! Application-layer protocol identification.
//!
//! Each parser inspects a transport-layer payload (already stripped of
//! Ethernet/IP/TCP/UDP headers by `capture::mod`) and, if it recognizes the
//! protocol, extracts a small set of human-readable fields. Parsers never
//! panic on malformed input — a parse error just means "not this protocol"
//! or "recognized but unparseable", never a crash.

pub mod dns;
pub mod http;
pub mod mqtt;
pub mod tls;

/// Transport context handed to every parser alongside the raw payload.
#[derive(Debug, Clone, Copy)]
pub struct Context {
    pub src_port: u16,
    pub dst_port: u16,
    pub is_tcp: bool,
}

/// Fields extracted from a recognized payload. Every field is optional
/// because different protocols surface different information.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct ParsedInfo {
    pub protocol: &'static str,
    pub detail: String,
    pub domain: Option<String>,
    pub method: Option<String>,
    pub path: Option<String>,
}

/// Implemented once per application-layer protocol NetLens understands.
pub trait Parser: Send + Sync {
    fn name(&self) -> &'static str;

    /// Cheap pre-check (port numbers, magic bytes) before attempting a full
    /// parse. Registries use this to avoid running every parser on every
    /// packet.
    fn can_parse(&self, payload: &[u8], ctx: &Context) -> bool;

    /// Full parse. Only called when `can_parse` returned true. Returns
    /// `None` if the bytes looked right at a glance but didn't hold up.
    fn parse(&self, payload: &[u8], ctx: &Context) -> Option<ParsedInfo>;
}

/// Ordered collection of parsers, tried in registration order.
pub struct ParserRegistry {
    parsers: Vec<Box<dyn Parser>>,
}

impl ParserRegistry {
    pub fn new() -> Self {
        let parsers: Vec<Box<dyn Parser>> = vec![
            Box::new(tls::TlsParser),
            Box::new(dns::DnsParser),
            Box::new(http::HttpParser),
            Box::new(mqtt::MqttParser),
        ];
        ParserRegistry { parsers }
    }

    /// Runs every registered parser's `can_parse`/`parse` pair against the
    /// payload and returns the first match.
    pub fn identify(&self, payload: &[u8], ctx: &Context) -> Option<ParsedInfo> {
        for parser in &self.parsers {
            if parser.can_parse(payload, ctx) {
                if let Some(info) = parser.parse(payload, ctx) {
                    return Some(info);
                }
            }
        }
        None
    }

    pub fn names(&self) -> Vec<&'static str> {
        self.parsers.iter().map(|p| p.name()).collect()
    }
}

impl Default for ParserRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_lists_all_four_parsers() {
        let reg = ParserRegistry::new();
        let names = reg.names();
        assert_eq!(names.len(), 4);
        assert!(names.contains(&"TLS"));
        assert!(names.contains(&"DNS"));
        assert!(names.contains(&"HTTP"));
        assert!(names.contains(&"MQTT"));
    }
}
