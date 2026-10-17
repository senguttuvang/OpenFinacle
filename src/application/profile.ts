import { Effect, Schema } from "effect";
import { BankingError, type Session } from "../domain/banking";
import { Store } from "../domain/ports";
import { Profile, ProfileDetail, ProfileEvent } from "../domain/profile";

const decode = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "The saved profile could not be verified. Ask the branch to inspect this relationship.",
          status: 503,
        }),
    ),
  );
export const customerProfile = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one(
      "SELECT * FROM synthetic_profiles WHERE bank_id=?",
      session.bank_id,
    );
    if (!row)
      return yield* Effect.fail(
        new BankingError({
          message:
            "No saved synthetic profile is available for this relationship.",
          status: 404,
        }),
      );
    const profile = yield* decode(
      Schema.Struct({
        ...Profile.fields,
        fields: Schema.parseJson(Profile.fields.fields),
      }),
      row,
    );
    const records = yield* store.all(
      "SELECT * FROM profile_events WHERE bank_id=? ORDER BY version",
      session.bank_id,
    );
    const history = yield* Effect.forEach(records, (record) =>
      decode(
        Schema.Struct({
          ...ProfileEvent.fields,
          fields: Schema.parseJson(ProfileEvent.fields.fields),
        }),
        record,
      ),
    );
    return yield* decode(ProfileDetail, { profile, history });
  });
