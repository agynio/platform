export type DatasourceConfig = { db?: { url?: string } };
export type PrismaClientOptions = { datasources?: DatasourceConfig };

export class PrismaClient {
  constructor(_opts?: PrismaClientOptions) {}
  public $connect = async (): Promise<void> => {};
  public $disconnect = async (): Promise<void> => {};
}
