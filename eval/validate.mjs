// 앱이 쓰는 JSON 스키마 형식(type/required/properties/items/additionalProperties)만 검사하는 작은 검증기.
// 결과가 앱 화면에서 깨지지 않고 표시될 수 있는지 판단하는 용도입니다.
export function validate(value, schema, path = "$", errors = []) {
  if (errors.length >= 8) return errors;
  const t = schema.type;
  const typeOk =
    t === "object" ? value && typeof value === "object" && !Array.isArray(value)
    : t === "array" ? Array.isArray(value)
    : t === "integer" ? Number.isInteger(value)
    : t === "number" ? typeof value === "number"
    : t === "string" ? typeof value === "string"
    : t === "boolean" ? typeof value === "boolean"
    : true;
  if (!typeOk) {
    errors.push(`${path}: ${t} 이어야 하는데 ${Array.isArray(value) ? "array" : value === null ? "null" : typeof value}`);
    return errors;
  }
  if (t === "object") {
    for (const k of schema.required || []) if (!(k in value)) errors.push(`${path}.${k}: 빠짐`);
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties?.[k];
      if (sub) validate(v, sub, `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}.${k}: 정의되지 않은 필드`);
    }
  }
  if (t === "array" && schema.items) value.forEach((v, i) => validate(v, schema.items, `${path}[${i}]`, errors));
  return errors;
}
