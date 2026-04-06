import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsObject()
  packageJson: Record<string, unknown>;
}
