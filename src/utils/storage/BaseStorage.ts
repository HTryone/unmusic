export const KEY_PREFIX = 'um.conf.';
const KEY_KGG_KEYS = `${KEY_PREFIX}kgg.keys`;
const KEY_QQ_COOKIE = `${KEY_PREFIX}qq.cookie`;
const KEY_QQ_PROXY = `${KEY_PREFIX}qq.proxy`;
const KEY_QQ_UIN = `${KEY_PREFIX}qq.uin`;

export default abstract class BaseStorage {
  protected abstract save<T>(name: string, value: T): Promise<void>;
  protected abstract load<T>(name: string, defaultValue: T): Promise<T>;
  public abstract getAll(): Promise<Record<string, any>>;
  public abstract setAll(obj: Record<string, any>): Promise<void>;

  public saveKggKeys(keys: string): Promise<void> {
    return this.save(KEY_KGG_KEYS, keys);
  }

  public loadKggKeys(defaultValue: string = ''): Promise<string> {
    return this.load(KEY_KGG_KEYS, defaultValue);
  }

  public saveQQCookie(cookie: string): Promise<void> {
    return this.save(KEY_QQ_COOKIE, cookie);
  }

  public loadQQCookie(defaultValue: string = ''): Promise<string> {
    return this.load(KEY_QQ_COOKIE, defaultValue);
  }

  public saveQQProxy(proxy: string): Promise<void> {
    return this.save(KEY_QQ_PROXY, proxy);
  }

  public loadQQProxy(defaultValue: string = ''): Promise<string> {
    return this.load(KEY_QQ_PROXY, defaultValue);
  }

  public saveQQUin(uin: string): Promise<void> {
    return this.save(KEY_QQ_UIN, uin);
  }

  public loadQQUin(defaultValue: string = ''): Promise<string> {
    return this.load(KEY_QQ_UIN, defaultValue);
  }
}
