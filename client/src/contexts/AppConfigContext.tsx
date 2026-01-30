import {
  createContext,
  useContext,
  type ReactNode,
  useState,
  useEffect
} from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import { getDefaultFoundationModel } from '@chat-template/ai-sdk-providers';

interface ConfigResponse {
  features: {
    chatHistory: boolean;
  };
  availableModels?: string[];
  defaultModel?: string;
}

interface AppConfigContextType {
  config: ConfigResponse | undefined;
  isLoading: boolean;
  error: Error | undefined;
  chatHistoryEnabled: boolean;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

const AppConfigContext = createContext<AppConfigContextType | undefined>(
  undefined,
);

const MODEL_STORAGE_KEY = 'selectedFoundationModel';

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading } = useSWR<ConfigResponse>(
    '/api/config',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Config should be loaded once and cached
      dedupingInterval: 60000, // 1 minute
    },
  );

  // Initialize selected model from localStorage or use default
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY);
      if (saved) return saved;
    }
    return data?.defaultModel || getDefaultFoundationModel();
  });

  // Update localStorage when model changes
  const setSelectedModel = (model: string) => {
    setSelectedModelState(model);
    if (typeof window !== 'undefined') {
      localStorage.setItem(MODEL_STORAGE_KEY, model);
    }
  };

  // Update selected model if config provides a different default
  useEffect(() => {
    if (data?.defaultModel && !localStorage.getItem(MODEL_STORAGE_KEY)) {
      setSelectedModelState(data.defaultModel);
    }
  }, [data]);

  const value: AppConfigContextType = {
    config: data,
    isLoading,
    error,
    // Default to true until loaded to avoid breaking existing behavior
    chatHistoryEnabled: data?.features.chatHistory ?? true,
    selectedModel,
    setSelectedModel,
  };

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  const context = useContext(AppConfigContext);
  if (context === undefined) {
    throw new Error('useAppConfig must be used within an AppConfigProvider');
  }
  return context;
}
