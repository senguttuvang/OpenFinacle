-- Existing cases remain readable; all future writes use the versioned case workflow.
CREATE TRIGGER service_case_require_submission_key BEFORE INSERT ON service_requests
WHEN NEW.request_key IS NULL OR length(NEW.request_key)=0
BEGIN
  SELECT RAISE(ABORT,'New service requests require a stable submission key');
END;
CREATE TRIGGER service_case_import_version_guard BEFORE UPDATE ON service_requests
WHEN OLD.request_key IS NULL AND (
  NEW.version<>OLD.version+1 OR NEW.request_key IS NOT ('imported:'||OLD.id)
  OR NEW.bank_id<>OLD.bank_id OR NEW.kind<>OLD.kind OR NEW.submitted_payload<>OLD.submitted_payload
)
BEGIN
  SELECT RAISE(ABORT,'Legacy service cases require a versioned import update');
END;
