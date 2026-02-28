export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type PublishedNotification = {
  id: string;
  event: string;
  rooms: string[];
  source: string;
  payload?: JsonObject;
  createdAt: Date;
};
