import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  collection: 'users',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      // Defence in depth. `select: false` below already keeps the hash out of normal
      // reads, but an explicit `.select('+passwordHash')` (which login needs) would
      // otherwise let it escape if such a document were ever serialised directly.
      //
      // NOTE: Nest's ClassSerializerInterceptor + @Exclude() does NOT help here —
      // those operate on class instances, and Mongoose hands back Documents, so the
      // interceptor is a no-op on them. This transform is what actually works.
      delete ret.passwordHash;
      delete ret.__v;
      return ret;
    },
  },
})
export class User {
  /**
   * Stored lowercased and trimmed so `Alice@Example.com` and `alice@example.com`
   * cannot become two accounts. The unique index enforces that at the database
   * level rather than relying on an application-level check that races.
   */
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email!: string;

  /**
   * Argon2id hash. `select: false` keeps it out of every query result unless a
   * caller explicitly asks for it — which only the login path does.
   */
  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ trim: true, maxlength: 80 })
  displayName?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
