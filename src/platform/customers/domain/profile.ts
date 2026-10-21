import { Schema } from "effect";

const ProfileFields = Schema.Struct({
  email: Schema.String,
  phone: Schema.String,
  address: Schema.String,
  city: Schema.String,
  pincode: Schema.String,
  home_branch: Schema.String,
  employer: Schema.String,
});
export const Profile = Schema.Struct({
  bank_id: Schema.String,
  fields: ProfileFields,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  updated_at: Schema.String,
});
export const ProfileEvent = Schema.Struct({
  id: Schema.String,
  bank_id: Schema.String,
  case_id: Schema.NullOr(Schema.String),
  actor: Schema.String,
  note: Schema.String,
  fields: ProfileFields,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  created_at: Schema.String,
});
export const ProfileDetail = Schema.Struct({
  profile: Profile,
  history: Schema.Array(ProfileEvent),
});
export type ProfileDetail = typeof ProfileDetail.Type;
