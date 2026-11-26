import fs from 'node:fs';
import path from 'node:path';

export class SecretStore {
  private readonly secrets: Record<string, string>;

  constructor(private readonly file: string) {
    this.secrets = SecretStore.read(file);
  }

  get(key: string): string | undefined {
    return this.secrets[key];
  }

  has(key: string): boolean {
    return key in this.secrets;
  }

  set(key: string, value: string): void {
    this.secrets[key] = value;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.secrets, null, 2)}\n`, { mode: 0o600 });
  }

  private static read(file: string): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  }
}
