# Multi-Channel Logging Implementation Plan

## 1. Client-Side (`packages/aperture-client/src/extension.ts`)

- Update `activate` function to listen for a custom notification: `telescope/log`.
- The notification payload will be `{ channel: string, level: 'log' | 'warn' | 'error', message: string }`.
- Maintain a map of channel names to `OutputChannel` instances:
  - `main` -> `MainOutputChannel`
  - `openapi` -> `OpenAPIOutputChannel`
  - `validation` -> `ValidationOutputChannel`
- Implement a handler that looks up the channel and calls `appendLine` (possibly with a timestamp or level prefix).

## 2. Server-Side (`packages/aperture-lsp/src/server.ts`)

- Create a `MultiChannelLogger` class that implements `DiagnosticsLogger`.
- This logger will take the `connection` object.
- It will implement `log`, `warn`, `error` but also support an optional `channel` argument or be instantiated with a specific channel.
- Since `DiagnosticsLogger` interface is fixed, we can create specific instances for each channel and pass them to the context, OR update `ApertureVolarContext` to support channel retrieval.
- **Better Approach**:
  - Keep `ApertureVolarContext` generic.
  - In `server.ts`, implement a `RemoteLogger` that wraps `connection.sendNotification('telescope/log', ...)`.
  - When creating `shared` context, pass a `RemoteLogger` configured for the "main" channel.
  - In `server.ts`, we can't easily change the `DiagnosticsLogger` interface without touching `context.ts`.
  - **Refinement**: Update `ApertureVolarContext`'s `getLogger(id)` to return a logger that knows its ID.
  - In `server.ts`, the root logger passed to `ApertureVolarContext` will be a `MultiChannelLogger`.
  - When `context.getLogger(id)` is called, it currently creates a scoped logger `[id] msg`.
  - We will modify `MultiChannelLogger` to interpret certain IDs as channels, or just treat the ID as the channel name if it matches known channels.
  - Actually, `getLogger(id)` wraps the base logger. If the base logger is `MultiChannelLogger`, it can't easily distinguish unless the wrapper passes the ID.
  - Current `getLogger` implementation:

    ```typescript
    log: (message: any, ...args: any[]) => this.logger.log?.(`${prefix}${message}`, ...args),
    ```

    It just prepends a string.

  - **Plan Refinement for Server**:
    1.  Define `RemoteLogger` class in `server.ts` (or a new file `services/logging/remote-logger.ts`).
    2.  It implements `DiagnosticsLogger`.
    3.  It sends `telescope/log` notifications.
    4.  We will replace `connection.console` with this `RemoteLogger` instance in `server.ts`.
    5.  To support _different_ channels, we need to update `ApertureVolarContext` to allow requesting a logger for a specific _channel_ (not just a scoped prefix).
    6.  **Minimal Change**: Update `ApertureVolarContext` to accept a `loggerFactory` or similar, OR just update `getLogger` to allow returning a specialized logger if available.
    7.  **Simpler**: Just map specific Scope IDs to channels in the `RemoteLogger`.
        - If message starts with `[OpenAPI]`, send to `openapi` channel.
        - If message starts with `[Validation]`, send to `validation` channel.
        - Otherwise send to `main`.
        - This avoids changing `ApertureVolarContext` significantly.

## 3. Implementation Steps

1.  **Client**: Add notification handler in `extension.ts`.
2.  **Server**: Create `RemoteLogger` class.
3.  **Server**: Update `server.ts` to use `RemoteLogger` with logic to parse `[Scope]` prefixes and route to channels.

## 4. Verification

- Verify that logs from `OpenAPI` plugin (which uses `getLogger("OpenAPI")`) go to the OpenAPI output channel.
- Verify that logs from `Validation` service go to Validation output channel.
- Verify standard logs go to Main channel.
