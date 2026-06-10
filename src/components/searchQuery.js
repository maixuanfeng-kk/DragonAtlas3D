export function normalizeDestinationQuery(submittedValue, stateValue) {
  const formValue = String(submittedValue || "").trim();
  if (formValue) {
    return formValue;
  }

  return String(stateValue || "").trim();
}
