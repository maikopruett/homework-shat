import { useDocuments } from './hooks/useDocuments';
import GoogleDocsUI from './components/GoogleDocsUI';

export default function App() {
  const {
    documents,
    activeDocument,
    isLoading,
    isWritingToDoc,
    isSearching,
    selectedModel,
    setSelectedModel,
    createDocument,
    switchDocument,
    updateTitle,
    updateContent,
    deleteDocument,
    sendMessage,
    stopGeneration,
    performSearch,
  } = useDocuments();

  return (
    <GoogleDocsUI 
      documents={documents}
      activeDocument={activeDocument}
      isLoading={isLoading}
      isWritingToDoc={isWritingToDoc}
      isSearching={isSearching}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      onSendMessage={sendMessage}
      onSearch={performSearch}
      onStopGeneration={stopGeneration}
      onCreateDocument={createDocument}
      onSwitchDocument={switchDocument}
      onUpdateTitle={updateTitle}
      onUpdateContent={updateContent}
      onDeleteDocument={deleteDocument}
    />
  );
}
