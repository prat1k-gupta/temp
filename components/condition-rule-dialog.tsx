"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ConditionRuleDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (rule: any) => void
  existingRule?: any
  connectedNodeType?: string
  availableFields: Array<{ value: string; label: string }>
  getOperators: (field: string) => Array<{ value: string; label: string }>
}

export function ConditionRuleDialog({
  isOpen,
  onClose,
  onSave,
  existingRule,
  connectedNodeType,
  availableFields,
  getOperators
}: ConditionRuleDialogProps) {
  const [field, setField] = useState(existingRule?.field || "")
  const [fieldLabel, setFieldLabel] = useState(existingRule?.fieldLabel || "")
  const [operator, setOperator] = useState(existingRule?.operator || "equals")
  const [operatorLabel, setOperatorLabel] = useState(existingRule?.operatorLabel || "equals")
  const [value, setValue] = useState(existingRule?.value || "")

  useEffect(() => {
    if (existingRule) {
      setField(existingRule.field || "")
      setFieldLabel(existingRule.fieldLabel || "")
      setOperator(existingRule.operator || "equals")
      setOperatorLabel(existingRule.operatorLabel || "equals")
      setValue(existingRule.value || "")
    } else {
      setField("")
      setFieldLabel("")
      setOperator("equals")
      setOperatorLabel("equals")
      setValue("")
    }
  }, [existingRule, isOpen])

  const operators = field ? getOperators(field) : []
  const needsValue = !["isEmpty", "isNotEmpty", "isTrue", "isFalse"].includes(operator)

  const handleSave = () => {
    const rule = {
      id: existingRule?.id || `rule-${Date.now()}`,
      branch: existingRule?.branch || "true",
      field,
      fieldLabel: fieldLabel || availableFields.find(f => f.value === field)?.label || field,
      operator,
      operatorLabel: operators.find(op => op.value === operator)?.label || operator,
      value: needsValue ? value : ""
    }
    onSave(rule)
    onClose()
  }

  const handleFieldChange = (newField: string) => {
    setField(newField)
    const fieldObj = availableFields.find(f => f.value === newField)
    setFieldLabel(fieldObj?.label || newField)
    // Reset operator when field changes
    setOperator("equals")
    setOperatorLabel("equals")
    setValue("")
  }

  const handleOperatorChange = (newOperator: string) => {
    setOperator(newOperator)
    const operatorObj = operators.find(op => op.value === newOperator)
    setOperatorLabel(operatorObj?.label || newOperator)
    // Clear value if operator doesn't need it
    if (["isEmpty", "isNotEmpty", "isTrue", "isFalse"].includes(newOperator)) {
      setValue("")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{existingRule ? "Edit Condition" : "Add Condition"}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Field Selection */}
          <div className="space-y-2">
            <Label>Field</Label>
            <Select value={field} onValueChange={handleFieldChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a field..." />
              </SelectTrigger>
              <SelectContent>
                {availableFields.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Operator Selection */}
          {field && (
            <div className="space-y-2">
              <Label>Operator</Label>
              <Select value={operator} onValueChange={handleOperatorChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operators.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Value Input */}
          {field && needsValue && (
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={field === "age" ? "e.g., 18" : "Enter value..."}
                type={["age", "length", "year"].includes(field) ? "number" : "text"}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!field || (needsValue && !value)} className="cursor-pointer">
            {existingRule ? "Update" : "Add"} Condition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

