import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenBlacklistService {
  // token → expiry timestamp in ms
  private readonly blacklist = new Map<string, number>();

  add(token: string): void {
    const exp = this.extractExp(token);
    this.blacklist.set(token, exp);
    this.prune();
  }

  has(token: string): boolean {
    const exp = this.blacklist.get(token);
    if (exp === undefined) return false;
    if (Date.now() > exp) {
      this.blacklist.delete(token);
      return false;
    }
    return true;
  }

  private extractExp(token: string): number {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'),
      ) as { exp?: number };
      return payload.exp ? payload.exp * 1000 : Date.now() + 3_600_000;
    } catch {
      return Date.now() + 3_600_000;
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [token, exp] of this.blacklist) {
      if (now > exp) this.blacklist.delete(token);
    }
  }
}
