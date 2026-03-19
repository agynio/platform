import { create, type DescMessage, type MessageInitShape, type MessageShape } from '@bufbuild/protobuf';

export const createMessage = <Desc extends DescMessage>(
  schema: Desc,
  init?: MessageInitShape<Desc>,
): MessageShape<Desc> => create(schema, init) as MessageShape<Desc>;
