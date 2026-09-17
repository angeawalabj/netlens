//! TLS (RFC 8446 / legacy 5246) — recognizes a ClientHello and pulls the
//! Server Name Indication out of the extensions block, without doing a full
//! handshake parse.

use super::{Context, ParsedInfo, Parser};

const CONTENT_TYPE_HANDSHAKE: u8 = 0x16;
const HANDSHAKE_TYPE_CLIENT_HELLO: u8 = 0x01;
const EXT_SERVER_NAME: u16 = 0x0000;
const SNI_HOST_NAME: u8 = 0x00;

pub struct TlsParser;

impl Parser for TlsParser {
    fn name(&self) -> &'static str {
        "TLS"
    }

    fn can_parse(&self, payload: &[u8], ctx: &Context) -> bool {
        ctx.is_tcp
            && payload.len() > 5
            && payload[0] == CONTENT_TYPE_HANDSHAKE
            && payload[1] == 0x03 // record-layer major version is always 3
    }

    fn parse(&self, payload: &[u8], _ctx: &Context) -> Option<ParsedInfo> {
        if payload.get(5) != Some(&HANDSHAKE_TYPE_CLIENT_HELLO) {
            return Some(ParsedInfo {
                protocol: "TLS",
                detail: "handshake record (not ClientHello)".into(),
                domain: None,
                method: None,
                path: None,
            });
        }

        let sni = extract_sni(payload);
        Some(ParsedInfo {
            protocol: "TLS",
            detail: match &sni {
                Some(name) => format!("ClientHello SNI={name}"),
                None => "ClientHello (no SNI)".into(),
            },
            domain: sni,
            method: None,
            path: None,
        })
    }
}

/// Walks a ClientHello body to find the `server_name` extension.
/// Record header (5) + handshake header (4) = 9 bytes before the body.
fn extract_sni(payload: &[u8]) -> Option<String> {
    let mut pos = 9;

    pos += 2; // client_version
    pos += 32; // random

    let session_id_len = *payload.get(pos)? as usize;
    pos += 1 + session_id_len;

    let cipher_suites_len = u16::from_be_bytes([*payload.get(pos)?, *payload.get(pos + 1)?]) as usize;
    pos += 2 + cipher_suites_len;

    let compression_len = *payload.get(pos)? as usize;
    pos += 1 + compression_len;

    if pos + 2 > payload.len() {
        return None; // no extensions block (pre-TLS1.0-ish or truncated capture)
    }
    let extensions_len = u16::from_be_bytes([*payload.get(pos)?, *payload.get(pos + 1)?]) as usize;
    pos += 2;
    let extensions_end = (pos + extensions_len).min(payload.len());

    while pos + 4 <= extensions_end {
        let ext_type = u16::from_be_bytes([payload[pos], payload[pos + 1]]);
        let ext_len = u16::from_be_bytes([payload[pos + 2], payload[pos + 3]]) as usize;
        let ext_data_start = pos + 4;
        let ext_data_end = ext_data_start + ext_len;
        if ext_data_end > payload.len() {
            return None;
        }

        if ext_type == EXT_SERVER_NAME {
            return parse_server_name_extension(&payload[ext_data_start..ext_data_end]);
        }

        pos = ext_data_end;
    }

    None
}

fn parse_server_name_extension(data: &[u8]) -> Option<String> {
    // server_name_list_length (2) is redundant with the extension length,
    // but the wire format still carries it.
    let mut pos = 2;
    if data.get(pos)? != &SNI_HOST_NAME {
        return None;
    }
    pos += 1;
    let name_len = u16::from_be_bytes([*data.get(pos)?, *data.get(pos + 1)?]) as usize;
    pos += 2;
    let name = data.get(pos..pos + name_len)?;
    Some(String::from_utf8_lossy(name).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client_hello_with_sni(host: &str) -> Vec<u8> {
        let mut sni_ext = vec![0x00, 0x00]; // server_name (type)
        let host_bytes = host.as_bytes();
        let entry_len = 1 + 2 + host_bytes.len();
        let list_len = entry_len;
        let mut sni_body = Vec::new();
        sni_body.extend_from_slice(&(list_len as u16).to_be_bytes());
        sni_body.push(SNI_HOST_NAME);
        sni_body.extend_from_slice(&(host_bytes.len() as u16).to_be_bytes());
        sni_body.extend_from_slice(host_bytes);
        sni_ext.extend_from_slice(&(sni_body.len() as u16).to_be_bytes());
        sni_ext.extend_from_slice(&sni_body);

        let mut body = Vec::new();
        body.extend_from_slice(&[0x03, 0x03]); // client_version
        body.extend_from_slice(&[0u8; 32]); // random
        body.push(0); // session_id_len = 0
        body.extend_from_slice(&2u16.to_be_bytes()); // cipher_suites_len
        body.extend_from_slice(&[0x13, 0x01]); // one cipher suite
        body.push(1); // compression_len
        body.push(0); // null compression
        body.extend_from_slice(&(sni_ext.len() as u16).to_be_bytes()); // extensions_len
        body.extend_from_slice(&sni_ext);

        let mut handshake = vec![HANDSHAKE_TYPE_CLIENT_HELLO];
        let body_len = body.len() as u32;
        handshake.extend_from_slice(&body_len.to_be_bytes()[1..]); // 3-byte length
        handshake.extend_from_slice(&body);

        let mut record = vec![CONTENT_TYPE_HANDSHAKE, 0x03, 0x01];
        record.extend_from_slice(&(handshake.len() as u16).to_be_bytes());
        record.extend_from_slice(&handshake);
        record
    }

    #[test]
    fn extracts_sni_from_client_hello() {
        let payload = client_hello_with_sni("example.com");
        let ctx = Context { src_port: 51000, dst_port: 443, is_tcp: true };
        assert!(TlsParser.can_parse(&payload, &ctx));
        let info = TlsParser.parse(&payload, &ctx).unwrap();
        assert_eq!(info.domain.as_deref(), Some("example.com"));
    }

    #[test]
    fn ignores_non_handshake_records() {
        let ctx = Context { src_port: 443, dst_port: 51000, is_tcp: true };
        let app_data = [0x17, 0x03, 0x03, 0x00, 0x01, 0xAB];
        assert!(!TlsParser.can_parse(&app_data, &ctx));
    }
}
