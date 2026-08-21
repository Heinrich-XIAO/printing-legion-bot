import { JSONFilePreset } from 'lowdb/node';

export const defaultData = {
  submissions: [],
  printers: [],
};
export const db = await JSONFilePreset("db.json", defaultData);