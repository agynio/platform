import { Controller, Get, Inject, Param, Post, Put, Body, Delete } from '@nestjs/common';
import { z } from 'zod';
import { VariablesService } from './variables.service';
import { CreateVariableBodySchema } from './dto/createVariable.dto';
import { UpdateVariableBodySchema } from './dto/updateVariable.dto';

@Controller('api/graphs/:name/variables')
export class VariablesController {
  constructor(@Inject(VariablesService) private readonly variables: VariablesService) {}

  @Get()
  async list(@Param('name') name: string) {
    return await this.variables.getVariables(name);
  }

  @Post()
  async create(@Param('name') name: string, @Body() body: unknown) {
    const parsed = CreateVariableBodySchema.safeParse(body);
    if (!parsed.success) {
      return { error: 'INVALID_BODY', details: parsed.error.flatten() };
    }
    // Service stub for now
    return { ok: true };
  }

  @Put(':key')
  async update(@Param('name') name: string, @Param('key') key: string, @Body() body: unknown) {
    const parsed = UpdateVariableBodySchema.safeParse(body);
    if (!parsed.success) {
      return { error: 'INVALID_BODY', details: parsed.error.flatten() };
    }
    return { ok: true };
  }

  @Delete(':key')
  async remove(@Param('name') name: string, @Param('key') key: string) {
    return { ok: true };
  }
}

