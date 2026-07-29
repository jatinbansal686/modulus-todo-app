import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

/**
 * All Mongoose access for users lives here.
 *
 * Keeping the ODM behind a repository means services deal in domain terms and can be
 * unit-tested against a small fake instead of a mocked query builder.
 */
@Injectable()
export class UsersRepository {
  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
  ) {}

  async create(
    email: string,
    passwordHash: string,
    displayName?: string,
  ): Promise<UserDocument> {
    return this.model.create({ email, passwordHash, displayName });
  }

  /** Normal lookup — the password hash is excluded by `select: false` on the schema. */
  async findById(id: string | Types.ObjectId): Promise<UserDocument | null> {
    return this.model.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.model.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  /**
   * Login-only lookup that opts the hash back in.
   *
   * Deliberately a separate method rather than a boolean flag on `findByEmail`, so
   * every place that pulls the hash out of the database is greppable.
   */
  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.model
      .findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash')
      .exec();
  }
}
