import { Module } from '@nestjs/common';
import { VariablesController } from './variables.controller';
import { VariablesService } from './variables.service';
import { CoreModule } from '../core/core.module';
import { GraphModule } from '../graph/graph.module';

@Module({ imports: [CoreModule, GraphModule], controllers: [VariablesController], providers: [VariablesService] })
export class VariablesModule {}

