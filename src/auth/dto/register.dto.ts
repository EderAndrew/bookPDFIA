import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  full_name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.',
  })
  password: string;

  @IsString()
  @MinLength(2)
  organization_name: string;
}
