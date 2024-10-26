import { Entity, Player, World } from "@minecraft/server";
import { Validator } from "../../Utilities/Validator";
import { Logger } from "../Logger";

type DynamicDBData = {
  [key: string | number]: any;
};

const IsInstanceOfType = (type: unknown): type is World | Player | Entity =>
  type instanceof World || type instanceof Player || type instanceof Entity;

/**
 * A class that represents a dynamic database for storing data associated with
 * a World, Entity, or Player.
 */
export class DynamicDB {
  private PROPERTIES: World | Entity | Player;
  private _Logger?: Logger;

  /**
   * Creates a new Dynamic Database.
   * @param { World | Entity | Player } type - The type of data to be stored (World, Entity, or Player).
   */
  constructor(type: World | Entity | Player) {
    this._Logger = Logger.DevMode();

    if (!IsInstanceOfType(type)) {
      this.log(
        "DynamicDB",
        "constructor",
        "Type must be an instance of Player, Entity, or World."
      );
      return;
    }

    this.PROPERTIES = type;
  }

  private log(unit: string, location: string, message: string): void {
    this._Logger?.Danger({ unit, location, message });
  }

  /**
   * Gets data from the database.
   * @param { string } key - The key of the data to retrieve.
   * @return { DynamicDBData | undefined } - The retrieved data, or undefined if the key does not exist.
   */
  get(key: string): DynamicDBData | undefined {
    if (!Validator.isString(key)) {
      this.log("DynamicDB", "get", "Key must be a string.");
      return undefined;
    }

    if (!this.hasKey(key)) {
      this.log("DynamicDB", "get", `Key with name '${key}' doesn't exist.`);
      return undefined;
    }

    const dynamic_props = this.PROPERTIES.getDynamicProperty(key) as string;
    return JSON.parse(dynamic_props);
  }

  /**
   * Set data to database.
   * @param { string } key - Database key.
   * @param { DynamicDBData } data - Data to save.
   * @return { boolean } - Returns true if success, and false if failed.
   */
  set(key: string, data: DynamicDBData): boolean {
    if (!Validator.isString(key)) {
      this.log("DynamicDB", "set", "Key must be a string.");
      return false;
    }

    if (!Validator.isObject(data)) {
      this.log("DynamicDB", "set", "Data must be a object.");
      return false;
    }

    try {
      const json_data = JSON.stringify(data);
      this.PROPERTIES.setDynamicProperty(key, json_data);
      return true;
    } catch (error) {
      this.log("DynamicDB", "set", "Failed to serialize data.");
      return false;
    }
  }

  /**
   * Gets the total number of bytes used by the database.
   * @returns { number } The total number of bytes used.
   */
  get bytes(): number {
    return this.PROPERTIES.getDynamicPropertyTotalByteCount();
  }

  /**
   * Returns all keys from the database.
   */
  get keys(): string[] {
    return this.PROPERTIES.getDynamicPropertyIds();
  }

  /**
   * Checks if a key exists in the database.
   * @param { string } key - Database key.
   * @return { boolean } - True if key exists, false otherwise.
   */
  hasKey(key: string): boolean {
    return this.keys.includes(key);
  }

  /**
   * Push data to existing key.
   * @param { string } key - Database key.
   * @param { DynamicDBData } data - Data to push.
   * @return { boolean } - Returns true if success, and false if failed.
   */
  push(key: string, data: DynamicDBData): boolean {
    if (!Validator.isString(key)) {
      this.log("DynamicDB", "push", "Key must be a string.");
      return false;
    }

    if (!Validator.isObject(data)) {
      this.log("DynamicDB", "push", "Data must be a object.");
      return false;
    }

    const existing = this.get(key);
    const merged = this.dataMerge(existing, data);
    return this.set(key, merged);
  }

  /**
   * Delete data by key.
   * @param { string } key - Database key.
   * @return { boolean } - Returns true if success, and false if failed.
   */
  delete(key: string): boolean {
    if (!Validator.isString(key)) {
      this.log("DynamicDB", "delete", "Key must be a string.");
      return false;
    }

    if (!this.hasKey(key)) {
      this.log("DynamicDB", "delete", `Key with name '${key}' doesn't exist.`);
      return false;
    }

    this.PROPERTIES.setDynamicProperty(key);
    return true;
  }

  /**
   * Resets the database.
   */
  reset(): void {
    this.PROPERTIES.clearDynamicProperties();
  }

  /**
   * Returns entries of the database.
   */
  *entries(): Iterable<[string, DynamicDBData]> {
    let key_idx = 0;
    while (key_idx < this.keys.length) {
      const key = this.keys[key_idx];
      const value = this.get(key);

      if (Validator.isUndefined(value)) {
        key_idx++;
        continue;
      }

      yield [key, value];
      key_idx++;
    }
  }

  /**
   * Returns database values.
   */
  *values(): Iterable<DynamicDBData> {
    const entries_arr = [...this.entries()];

    let entries_idx = 0;
    while (entries_idx < entries_arr.length) {
      const [, value] = entries_arr[entries_idx];
      yield value;
      entries_idx++;
    }
  }

  /**
   * Find value without key.
   * @param { Function } callbackfn - A function that accepts a key and a value.
   * @return { DynamicDBData | undefined } - Returns DynamicDB data or undefined.
   */
  find(
    callbackfn: (value: DynamicDBData, key: string) => boolean
  ): DynamicDBData | undefined {
    const entries_arr = [...this.entries()];

    let entries_idx = 0;
    while (entries_idx < entries_arr.length) {
      const [key, value] = entries_arr[entries_idx];
      if (callbackfn(value, key)) return value;
      entries_idx++;
    }

    return undefined;
  }

  /**
   * Apply a function to each key-value pair in the database.
   * @param { Function } callbackfn - A function that accepts a key and a value.
   */
  forEach(callbackfn: (value: DynamicDBData, key: string) => void): void {
    const entries_arr = [...this.entries()];

    let entries_idx = 0;
    while (entries_idx < entries_arr.length) {
      const [key, value] = entries_arr[entries_idx];
      callbackfn(value, key);
      entries_idx++;
    }
  }

  /**
   * Merges two data objects.
   * @param { DynamicDBData } existing - Existing data.
   * @param { DynamicDBData } newData - New data to merge.
   * @return { DynamicDBData } - Merged data.
   */
  private dataMerge(
    existing: DynamicDBData,
    newData: DynamicDBData
  ): DynamicDBData {
    return { ...existing, ...newData };
  }
}
