
import assert from "node:assert/strict";

import {
  createImageJSON,
  storeImageJSON,
  getImageJSON,
  getImageJSONString,
  clearImageJSON,
} from "./imageJson";

function runTests() {
  console.log("Starting Image JSON tests...\n");

  // Test 1: JSON creation
  const mockBase64 = "iVBORw0KGgoAAAANSUhEUgAA";

  const imageJSON = createImageJSON(mockBase64);

  assert.deepEqual(imageJSON, {
    image: mockBase64,
  });

  console.log("PASS: JSON object creation");

  // Test 2: Serialization
  const serialized = JSON.stringify(imageJSON);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.image, mockBase64);

  console.log("PASS: JSON serialization");

  // Test 3: In-memory storage
  storeImageJSON(imageJSON);

  const retrieved = getImageJSON();

  assert.deepEqual(retrieved, imageJSON);

  console.log("PASS: In-memory storage");

  // Test 4: JSON string retrieval
  const jsonString = getImageJSONString();

  if (jsonString === null) {
    throw new Error("JSON string was unexpectedly null.");
  }

  const parsedStoredJSON: unknown = JSON.parse(jsonString);

  assert.deepEqual(parsedStoredJSON, {
    image: mockBase64,
  });

  console.log("PASS: JSON string retrieval");

  // Test 5: Empty input validation
  assert.throws(() => {
    createImageJSON("");
  });

  console.log("PASS: Empty image validation");

  // Test 6: Clear memory
  clearImageJSON();

  assert.equal(getImageJSON(), null);

  console.log("PASS: Memory clearing");

  console.log("\nAll tests passed successfully!");
}

runTests();