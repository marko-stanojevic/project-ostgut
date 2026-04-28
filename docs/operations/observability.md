# Observability

This project uses structured stdout logs everywhere and OpenTelemetry traces where explicitly enabled.

## Local development

Local logs are written to the terminal. The backend logger uses text output when `ENV=local` or `ENV` is unset.

Tracing is disabled by default:

```bash
OTEL_TRACES_EXPORTER=none
```

To inspect local spans in the terminal, run the backend with:

```bash
OTEL_TRACES_EXPORTER=stdout
```

## Staging and production

Staging and production run on Azure Container Apps with Azure Monitor Application Insights as the central telemetry surface.

The backend container sets:

```bash
OTEL_TRACES_EXPORTER=otlp
OTEL_SERVICE_NAME=backend
SERVICE_VERSION=<backend image tag>
```

The Container Apps managed OpenTelemetry agent injects the OTLP gRPC endpoint and protocol at runtime, then forwards traces to Application Insights. Container stdout/stderr logs continue to flow to the Log Analytics workspace through the Container Apps environment.

## Correlation

Request logs include `request_id` and, when tracing is active, `trace_id`. Use `trace_id` to move between backend JSON logs in Log Analytics and distributed trace views in Application Insights.

Useful starting points:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s has "backend"
| where Log_s has "trace_id"
| order by TimeGenerated desc
```

```kusto
requests
| order by timestamp desc
```

```kusto
traces
| order by timestamp desc
```

## Logging rules

Do not log authorization headers, cookies, tokens, secrets, or raw stream URLs with query strings. Prefer stable identifiers such as `station_id`, `stream_id`, `request_id`, and `trace_id`.

Use event-shaped logs for platform workflows. The `event` field should be a stable machine-readable name such as `metadata_fetch_completed`, `stream_probe_completed`, or `http_request_completed`.

Database pool pressure is emitted once per minute by the backend with `event=database_pool_stats_recorded`. Use it for pool saturation checks after backend deploys:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s has "backend"
| where Log_s has "database_pool_stats_recorded"
| order by TimeGenerated desc
```
