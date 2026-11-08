# Copilot completed-child public messages

Scope approved by root: only public persisted child assistant.message rows actually observed in the already-verified parent events record. No guessed child-session path, no newer-schema-only numeric projection.

Private fold captures a content fingerprint only while the exact formal started event has occurred and before its completed/failed event. A new start replaces that run's set even at the same millisecond and same toolCallId. Each fingerprint includes immutable event ID, timestamp, messageId, and full public content SHA-256; the terminal binding key already includes both lifecycle event IDs, namespace and parent scope. Only that exact set can produce say entries. Parent/foreign/ephemeral/phase/private/nontext/tool rows never produce entries. Per-run 64 and global 4096 retained fingerprints; excess explicitly marks incomplete history and omittedBefore. Lifecycle/count/model/usage semantics remain unchanged.

Transcript-only open returns an owned parent FD after exact EOF/ns/path/UID proof. Four physical leases remain held through close. Read rechecks current scope and FD/path revision. Usage purpose is always rejected; no parent aggregate reuse. Public API shape unchanged; one private optional omission bit is added and OR'ed into the existing response.

Static installed evidence: Windows 0.0.362 callback rejects missing parentToolCallId, emits assistant.message with that exact ID and public content, and ignores child model_call_success/failure. Non-ephemeral events are appended by the session writer. Linux 1.0.105 is an opaque native package with no inspectable JS writer/SDK declaration; its managed-child path/emit reachability is not measured. Current official SDK documentation offers newer totalTokens/model fields, but no claim is made that the installed runtime supplies them. Source: https://github.com/github/copilot-sdk/blob/main/docs/features/streaming-events.md#sub-agent-and-skill-events . No large source bundle is copied, only SHA/byte locations.

No actual CLI/model/Windows/user record access, no trust/auth/hook update, no direct-child transport inferred from a tool identifier.
