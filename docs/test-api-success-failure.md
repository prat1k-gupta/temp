# Manual Test Plan: API Node Success/Failure Handles

## Prerequisites
- MagicFlow running locally
- FS Chat running (local Docker or ngrok)
- A published flow with at least one API fetch node

---

## Test 1: MagicFlow — Dual Handles Render

1. Open MagicFlow flow editor
2. Drag an "API Call" node onto the canvas
3. **Verify:** Node shows two output handles — "Success" (green) and "Error" (red)
4. **Verify:** No "Next" handle (old single handle) is visible

## Test 2: MagicFlow — Connect Both Handles

1. Add a Message node "API succeeded!" and connect it to the Success handle
2. Add a Message node "API failed!" and connect it to the Error handle
3. **Verify:** Both edges render correctly, green edge to success message, red edge to error message
4. **Verify:** Properties panel shows URL, method, response mapping, fallback message (unchanged)

## Test 3: MagicFlow — Publish with Dual Handles

1. Publish the flow
2. **Verify:** No publish validation errors
3. Check the published flow JSON (browser network tab or FS Chat API):
   - `conditional_next` should have `{ "success": "step_name", "error": "step_name" }`
   - `next_step` should equal the success target

## Test 4: MagicFlow — Backward Compat (Old Flows)

1. Load an existing flow that has an API fetch node with the old single handle
2. **Verify:** The edge connects to the "Success" handle (migration applied)
3. Republish the flow
4. **Verify:** Flow still works identically to before

## Test 5: FS Chat Vue — Dual Selectors

1. Open FS Chat flow builder (`/chatbot/flows`)
2. Create or edit a flow with an API fetch step
3. **Verify:** Properties panel shows "On Success → Go To" (green dot) and "On Error → Go To" (red dot) instead of single "Go To Step"
4. Select different target steps for success and error
5. Save the flow
6. **Verify:** Flow diagram shows green and red lines from the API step

## Test 6: Runtime — Success Path

1. Create a flow: Start → API Call (valid URL like `https://httpbin.org/get`) → Success Message → Complete
2. Configure response mapping (e.g., `origin` = `origin`)
3. Connect Error handle to an error message
4. Publish and trigger via API:
   ```bash
   curl -X POST "http://localhost:8080/api/chatbot/flows/{id}/send" \
     -H "X-API-Key: ..." \
     -H "Content-Type: application/json" \
     -d '{"phone_number": "+919773722464"}'
   ```
5. **Verify:** Success message is sent (not error message)
6. **Verify:** Response mapping variables are populated in session

## Test 7: Runtime — Error Path

1. Same flow but change API URL to an invalid endpoint (e.g., `https://httpbin.org/status/500`)
2. Republish and trigger
3. **Verify:** Fallback message is sent
4. **Verify:** Flow routes to the Error handle's target step (not success)
5. Check FS Chat chat view — error message should show the API error details

## Test 8: Runtime — Backward Compat (Old Published Flow)

1. Trigger an old published flow that has api_fetch WITHOUT conditional_next
2. **Verify:** Flow works identically to before — success continues to next_step, error sends fallback and continues to next_step

## Test 9: MagicFlow — Only Success Connected

1. Create a flow with API node, connect only the Success handle, leave Error empty
2. Publish and trigger with a failing API
3. **Verify:** Fallback message sent, flow continues to Success target (backward-compat behavior)

## Test 10: AI Graph String

1. Open the flow graph debug panel (bottom panel)
2. **Verify:** API fetch node edges show `--[Success]-->` and `--[Error]-->` labels in the ASCII tree
