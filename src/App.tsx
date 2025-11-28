import { useDocuments } from './hooks/useDocuments';
import GoogleDocsUI from './components/GoogleDocsUI';

export default function App() {
  const {
    documents,
    activeDocument,
    isLoading,
    isWritingToDoc,
    selectedModel,
    setSelectedModel,
    createDocument,
    switchDocument,
    updateTitle,
    updateContent,
    deleteDocument,
    sendMessage,
    stopGeneration,
  } = useDocuments();

  return (
    <GoogleDocsUI 
      documents={documents}
      activeDocument={activeDocument}
      isLoading={isLoading}
      isWritingToDoc={isWritingToDoc}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      onSendMessage={sendMessage}
      onStopGeneration={stopGeneration}
      onCreateDocument={createDocument}
      onSwitchDocument={switchDocument}
      onUpdateTitle={updateTitle}
      onUpdateContent={updateContent}
      onDeleteDocument={deleteDocument}
    />
  );
}
