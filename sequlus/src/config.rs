use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "sequlus")]
pub struct Config {
    #[arg(long, default_value = "http://localhost:8079")]
    pub backend_url: String,
    #[arg(long, default_value = "8080")]
    pub port: u16,
    #[arg(long, default_value = "./reference_genomes")]
    pub reference_genomes_dir: String,
    #[arg(long)]
    pub organisms: Option<String>,
    #[arg(long, default_value = "postgres://postgres:unsecure@localhost:5432/loculus")]
    pub database_url: String,
    #[arg(long, default_value = "./data")]
    pub data_dir: String,
    #[arg(long, default_value = "300")]
    pub refresh_interval_secs: u64,
}
