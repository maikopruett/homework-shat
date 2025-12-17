import { useDocuments } from './hooks/useDocuments';
import GoogleDocsUI from './components/GoogleDocsUI';

export default function App() {
  const {
    documents,
    activeDocument,
    isLoading,
    isSearching,
    selectedModel,
    setSelectedModel,
    personaSettings,
    updatePersona,
    ghostModeEnabled,
    toggleGhostMode,
    templates,
    selectedTemplate,
    setSelectedTemplate,
    saveAsTemplate,
    deleteTemplate,
    createDocument,
    switchDocument,
    updateTitle,
    updateContent,
    deleteDocument,
    sendMessage,
    stopGeneration,
    performSearch,
    // Plan mode state
    currentTodos,
    todoProgress,
    pendingQuestion,
    answerQuestion,
  } = useDocuments();

  return (
    <GoogleDocsUI 
      documents={documents}
      activeDocument={activeDocument}
      isLoading={isLoading}
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
      personaSettings={personaSettings}
      onUpdatePersona={updatePersona}
      ghostModeEnabled={ghostModeEnabled}
      onToggleGhostMode={toggleGhostMode}
      templates={templates}
      selectedTemplate={selectedTemplate}
      onSelectTemplate={setSelectedTemplate}
      onSaveAsTemplate={saveAsTemplate}
      onDeleteTemplate={deleteTemplate}
      // Plan mode props
      todos={currentTodos}
      todoProgress={todoProgress}
      pendingQuestion={pendingQuestion}
      onAnswerQuestion={answerQuestion}
    />
  );
}
