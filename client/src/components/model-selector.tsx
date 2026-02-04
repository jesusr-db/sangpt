import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { MODEL_CAPABILITIES, type FoundationModelId } from '@chat-template/ai-sdk-providers';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  disabled = false,
  className = '',
}: ModelSelectorProps) {
  const models = Object.entries(MODEL_CAPABILITIES);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor="model-select" className='font-medium text-gray-700 text-sm dark:text-gray-300'>
        Model:
      </label>
      <Select
        value={selectedModel}
        onValueChange={onModelChange}
        disabled={disabled}
      >
        <SelectTrigger id="model-select" className="w-[280px]">
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {models.map(([modelId, capabilities]) => (
            <SelectItem key={modelId} value={modelId}>
              <div className="flex flex-col">
                <span className="font-medium">{capabilities.name}</span>
                <span className='text-gray-500 text-xs dark:text-gray-400'>
                  {capabilities.maxTokens.toLocaleString()} tokens
                  {capabilities.supportsVision && ' • Vision'}
                  {capabilities.supportsTools && ' • Tools'}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ModelCapabilities({ modelId }: { modelId: string }) {
  const capabilities = MODEL_CAPABILITIES[modelId as FoundationModelId];

  if (!capabilities) {
    return null;
  }

  return (
    <div className='mt-1 text-gray-500 text-xs dark:text-gray-400'>
      <p>{capabilities.description}</p>
      <div className='mt-1 flex gap-2'>
        <span className='rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800'>
          {capabilities.maxTokens.toLocaleString()} tokens
        </span>
        {capabilities.supportsVision && (
          <span className='rounded bg-blue-100 px-2 py-0.5 dark:bg-blue-900'>
            Vision
          </span>
        )}
        {capabilities.supportsTools && (
          <span className='rounded bg-green-100 px-2 py-0.5 dark:bg-green-900'>
            Tools
          </span>
        )}
      </div>
    </div>
  );
}