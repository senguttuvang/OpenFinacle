CREATE TABLE synthetic_profiles (
  bank_id TEXT PRIMARY KEY REFERENCES banks(id),
  fields TEXT NOT NULL CHECK(json_valid(fields)),
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE profile_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  bank_id TEXT NOT NULL REFERENCES synthetic_profiles(bank_id),
  case_id TEXT UNIQUE REFERENCES service_requests(id),
  actor TEXT NOT NULL,
  note TEXT NOT NULL,
  fields TEXT NOT NULL CHECK(json_valid(fields)),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(bank_id,version)
);
CREATE TRIGGER profile_created AFTER INSERT ON synthetic_profiles
BEGIN
  INSERT INTO profile_events(bank_id,actor,note,fields,version,created_at) VALUES(NEW.bank_id,'system','Current synthetic baseline imported; earlier maintenance effects are unavailable.',NEW.fields,0,NEW.updated_at);
END;
INSERT INTO synthetic_profiles(bank_id,fields)
SELECT b.id,json_object('email',COALESCE(a.email,'mira@example.test'),'phone',COALESCE(a.phone,'9000000001'),'address',COALESCE(a.address,'14 Garden Lane, Adyar, Chennai 600020'),'city','','pincode','','home_branch','Adyar · Chennai (demo)','employer',COALESCE(a.employment,''))
FROM banks b LEFT JOIN applications a ON a.bank_id=b.id WHERE b.customer_account>0;
CREATE TRIGGER profile_for_relationship AFTER INSERT ON banks WHEN NEW.customer_account>0
BEGIN
  INSERT INTO synthetic_profiles(bank_id,fields) VALUES(NEW.id,'{"email":"mira@example.test","phone":"9000000001","address":"14 Garden Lane, Adyar, Chennai 600020","city":"","pincode":"","home_branch":"Adyar · Chennai (demo)","employer":""}');
END;
CREATE TRIGGER profile_after_account_opened AFTER UPDATE OF customer_account ON banks WHEN NEW.customer_account>0
BEGIN
  INSERT INTO synthetic_profiles(bank_id,fields)
  SELECT b.id,json_object('email',COALESCE(a.email,'mira@example.test'),'phone',COALESCE(a.phone,'9000000001'),'address',COALESCE(a.address,'14 Garden Lane, Adyar, Chennai 600020'),'city','','pincode','','home_branch','Adyar · Chennai (demo)','employer',COALESCE(a.employment,''))
  FROM banks b LEFT JOIN applications a ON a.bank_id=b.id WHERE b.id=NEW.id ON CONFLICT(bank_id) DO NOTHING;
END;
CREATE TRIGGER profile_event_immutable BEFORE UPDATE ON profile_events BEGIN SELECT RAISE(ABORT,'Profile history is immutable'); END;
CREATE TRIGGER profile_event_no_delete BEFORE DELETE ON profile_events BEGIN SELECT RAISE(ABORT,'Profile history is immutable'); END;
CREATE TRIGGER profile_update_guard BEFORE UPDATE ON synthetic_profiles
BEGIN
  SELECT CASE WHEN NEW.bank_id<>OLD.bank_id OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM profile_events WHERE bank_id=NEW.bank_id AND version=NEW.version AND fields=NEW.fields AND created_at=NEW.updated_at AND case_id IS NOT NULL) THEN RAISE(ABORT,'Profile changes require an approved case event') END;
END;
CREATE TRIGGER approved_case_profile_effect AFTER UPDATE ON service_requests
WHEN NEW.status='fulfilled' AND OLD.status<>'fulfilled' AND NEW.kind IN ('address_change','email_change','branch_transfer','employer_change')
BEGIN
  SELECT CASE WHEN NEW.updated_by<>'approver' OR NOT EXISTS(SELECT 1 FROM synthetic_profiles WHERE bank_id=NEW.bank_id) THEN RAISE(ABORT,'Profile maintenance requires independent approval and a saved profile') END;
  INSERT INTO profile_events(bank_id,case_id,actor,note,fields,version,created_at)
  SELECT NEW.bank_id,NEW.id,NEW.updated_by,NEW.outcome_note,
    CASE NEW.kind
      WHEN 'address_change' THEN json_set(fields,'$.address',json_extract(NEW.payload,'$.address'),'$.city',json_extract(NEW.payload,'$.city'),'$.pincode',json_extract(NEW.payload,'$.pincode'))
      WHEN 'email_change' THEN json_set(fields,'$.email',json_extract(NEW.payload,'$.email'))
      WHEN 'branch_transfer' THEN json_set(fields,'$.home_branch',json_extract(NEW.payload,'$.branch'))
      WHEN 'employer_change' THEN json_set(fields,'$.employer',json_extract(NEW.payload,'$.employer'))
    END,version+1,NEW.updated_at FROM synthetic_profiles WHERE bank_id=NEW.bank_id;
  UPDATE synthetic_profiles SET fields=(SELECT fields FROM profile_events WHERE case_id=NEW.id),version=version+1,updated_at=NEW.updated_at WHERE bank_id=NEW.bank_id;
END;
