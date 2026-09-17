//! CLI configuration: interface selection, WebSocket port, capture filter.

const USAGE: &str = "\
netlens-capture — NetLens live packet capture engine

USAGE:
    netlens-capture [OPTIONS]

OPTIONS:
    --interface <NAME>       Network interface to capture on (default: auto-detect)
    --port <PORT>             WebSocket server port (default: 9191)
    --filter <BPF>            BPF capture filter (default: \"tcp or udp or icmp\")
    --watch-prefix <PREFIX>   Flag traffic to a destination IP starting with PREFIX
                              (repeatable, e.g. --watch-prefix 203.0.113.)
    --list-interfaces          List available capture interfaces and exit
    --help                     Print this message
";

#[derive(Debug, Clone)]
pub struct Config {
    pub interface: Option<String>,
    pub port: u16,
    pub filter: String,
    pub list_interfaces: bool,
    pub watch_prefixes: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            interface: None,
            port: 9191,
            filter: "tcp or udp or icmp".to_string(),
            list_interfaces: false,
            watch_prefixes: Vec::new(),
        }
    }
}

impl Config {
    /// Parses CLI args, exits the process on --help or a malformed flag.
    pub fn from_args<I: Iterator<Item = String>>(mut args: I) -> Config {
        let mut cfg = Config::default();
        args.next(); // skip argv[0]

        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--interface" => {
                    cfg.interface = Some(Self::expect_value(&mut args, "--interface"));
                }
                "--port" => {
                    let raw = Self::expect_value(&mut args, "--port");
                    cfg.port = raw.parse().unwrap_or_else(|_| {
                        eprintln!("error: --port expects a number, got '{raw}'");
                        std::process::exit(1);
                    });
                }
                "--filter" => {
                    cfg.filter = Self::expect_value(&mut args, "--filter");
                }
                "--watch-prefix" => {
                    cfg.watch_prefixes.push(Self::expect_value(&mut args, "--watch-prefix"));
                }
                "--list-interfaces" => cfg.list_interfaces = true,
                "--help" | "-h" => {
                    println!("{USAGE}");
                    std::process::exit(0);
                }
                other => {
                    eprintln!("error: unknown option '{other}'\n\n{USAGE}");
                    std::process::exit(1);
                }
            }
        }

        cfg
    }

    fn expect_value<I: Iterator<Item = String>>(args: &mut I, flag: &str) -> String {
        args.next().unwrap_or_else(|| {
            eprintln!("error: {flag} expects a value");
            std::process::exit(1);
        })
    }

    /// Resolves the capture interface: explicit --interface, otherwise the
    /// first non-loopback device libpcap reports, falling back to whatever
    /// pcap considers the default (e.g. "en0" on macOS, "eth0" on Linux).
    pub fn resolve_interface(&self) -> Result<String, pcap::Error> {
        if let Some(name) = &self.interface {
            return Ok(name.clone());
        }

        let devices = pcap::Device::list()?;
        let picked = devices
            .iter()
            .find(|d| !d.flags.is_loopback() && d.flags.is_up())
            .or_else(|| devices.first());

        match picked {
            Some(d) => Ok(d.name.clone()),
            None => pcap::Device::lookup()?
                .map(|d| d.name)
                .ok_or_else(|| pcap::Error::PcapError("no capture device found".into())),
        }
    }
}
