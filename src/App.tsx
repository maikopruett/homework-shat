import { useDocuments } from './hooks/useDocuments';
import GoogleDocsUI from './components/GoogleDocsUI';

export default function App() {
  const {
    documents,
    activeDocument,
    isLoading,
    isWritingToDoc,
    createDocument,
    switchDocument,
    updateTitle,
    updateContent,
    deleteDocument,
    sendMessage,
  } = useDocuments();

  return (
    <GoogleDocsUI 
      documents={documents}
      activeDocument={activeDocument}
      isLoading={isLoading}
      isWritingToDoc={isWritingToDoc}
      onSendMessage={sendMessage}
      onCreateDocument={createDocument}
      onSwitchDocument={switchDocument}
      onUpdateTitle={updateTitle}
      onUpdateContent={updateContent}
      onDeleteDocument={deleteDocument}
    />
  );
}
