# Remote Stave Control Roadmap

This document describes how the local embedded MCP design can evolve when the bot and the Stave app are not on the same machine.

## Current Assumption

The initial embedded MCP server is same-user and same-machine only:

- local loopback transport
- local token file / manifest discovery
- no internet exposure

That assumption is intentional. It keeps packaged desktop automation simple and avoids shipping a half-secure remote surface.

## Future Goal

Allow a remote bot or orchestration service to create workspaces and run Stave tasks on a user's machine without requiring direct filesystem sharing.

## Recommended Future Shapes

### 1. Paired Relay

The local Stave app keeps the real MCP server private and opens an outbound connection to a relay.

Properties:

- safest default for consumer installs
- no inbound port opening on the user machine
- works behind NAT
- supports presence, task queueing, and delivery retries

Needed pieces:

- device registration and pairing
- relay-issued short-lived access tokens
- end-to-end request signing
- job queue and resumable delivery

### 2. Reverse Tunnel

The local app exposes its local MCP service through a tunnel started by the user or by a paired helper.

Properties:

- fast to prototype
- easier for internal teams than public users
- still needs strong auth and origin restrictions

Needed pieces:

- tunnel lifecycle management
- tunnel identity binding to a specific signed-in Stave instance
- strict rate limiting and auditing

### 3. Companion Worker

A lightweight local worker on the target machine receives remote jobs and delegates them to the embedded MCP server over loopback.

Properties:

- keeps Stave itself local-only
- clean split between remote transport and local execution
- easiest path for enterprise fleet management

Needed pieces:

- worker install/update story
- machine enrollment
- secure handoff between worker and local Stave runtime

## Security Requirements Before Any Remote Exposure

- mutual auth between remote caller and local machine
- short-lived tokens instead of durable shared secrets
- machine and user binding for every request
- replay protection and audit logs
- workspace allowlists per project path
- explicit approval policy for dangerous commands

## Protocol Guidance

- Keep MCP as the logical tool contract.
- Do not expose the packaged app's raw local MCP port directly to the internet.
- Add a relay or worker layer that translates remote auth/session state into local same-machine MCP calls.

## Data / Execution Model

Remote control should stay job-oriented:

1. create or select target machine
2. enqueue job against a project
3. local Stave creates workspace/task
4. provider turn executes locally
5. status, approvals, and artifacts sync back through the relay

This is better than trying to mirror the full renderer state remotely.

## Incremental Path

### Step 1

- ship the local embedded MCP endpoint
- validate same-machine flows with a local automation client

### Step 2

- add machine-readable local manifest + health checks
- add structured task status and approval polling

### Step 3

- introduce a relay or local worker for remote-triggered jobs
- keep the embedded MCP surface as the execution backend

### Step 4

- add remote approvals, audit logs, and tighter policy controls

## Open Questions

- Should remote requests require the Stave renderer window to be open, or should background execution be allowed?
- Should remote runs be restricted to dedicated automation workspaces only?
- How should human approval prompts route back to the original requester: Slack thread, web dashboard, or both?
- Do we want per-project enrollment and ACLs before a remote caller can trigger workspace creation?
