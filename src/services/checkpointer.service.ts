import { MongoClient } from "mongodb";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";

import { ConfigService } from "./config.service";
import { LoggerService } from "./logger.service";

export class CheckpointerService {
  private _mongoClient: MongoClient;

  private get mongoClient() {
    if (!this._mongoClient) {
      throw new Error("MongoClient not initialized");
    }
    return this._mongoClient;
  }

  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this._mongoClient = new MongoClient(this.configService.mongodbUrl);
  }

  getCheckpointer() {
    return new MongoDBSaver({ client: this.mongoClient });
  }
}
