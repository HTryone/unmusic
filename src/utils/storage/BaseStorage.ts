export const KEY_PREFIX = 'um.conf.';
const KEY_JOOX_UUID = `${KEY_PREFIX}joox.uuid`;
const KEY_KGG_KEYS = `${KEY_PREFIX}kgg.keys`;

export default abstract class BaseStorage {
  protected abstract save<T>(name: string, value: T): Promise<void>;
  protected abstract load<T>(name: string, defaultValue: T): Promise<T>;
  public abstract getAll(): Promise<Record<string, any>>;
  public abstract setAll(obj: Record<string, any>): Promise<void>;

  public saveJooxUUID(uuid: string): Promise<void> {
    return this.save(KEY_JOOX_UUID, uuid);
  }

  public loadJooxUUID(defaultValue: string = ''): Promise<string> {
    return this.load(KEY_JOOX_UUID, defaultValue);
  }

  public saveKggKeys(keys: string): Promise<void> {
    return this.save(KEY_KGG_KEYS, keys);
  }

  public loadKggKeys(defaultValue: string = ''): Promise<string> {
    return this.load(KEY_KGG_KEYS, defaultValue);
  }
}
