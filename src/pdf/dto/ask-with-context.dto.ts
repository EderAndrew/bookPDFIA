import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class AskWithContextDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsUUID()
  projectId: string;
}
