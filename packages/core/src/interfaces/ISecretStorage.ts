// ============================================================
// ISecretStorage — secure storage abstraction
// VS Code → SecretStorage, JetBrains → PasswordSafe
// ============================================================

export interface ISecretStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
