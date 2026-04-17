/** Flat tree rows for file-explorer demo (parentId null = root). */
export const treeFlatRows = [
  { id: "t1", parentId: null, name: "Desktop", kind: "folder", created: null, modified: null, sizeBytes: null },
  { id: "t2", parentId: "t1", name: "ProjectAlpha", kind: "folder", created: null, modified: null, sizeBytes: null },
  { id: "t3", parentId: "t2", name: "Proposal.docx", kind: "file", created: "2024-01-10", modified: "2024-02-01", sizeBytes: 500 * 1024 },
  { id: "t4", parentId: "t2", name: "Timeline.xlsx", kind: "file", created: "2024-01-12", modified: "2024-02-02", sizeBytes: 1024 * 1024 },
  { id: "t5", parentId: "t1", name: "ToDoList.txt", kind: "file", created: "2024-03-01", modified: "2024-03-02", sizeBytes: 12 * 1024 },
  { id: "t6", parentId: "t1", name: "MeetingNotes_August.pdf", kind: "file", created: "2024-04-01", modified: "2024-04-02", sizeBytes: 256 * 1024 },
  { id: "t7", parentId: null, name: "Documents", kind: "folder", created: null, modified: null, sizeBytes: null },
  { id: "t8", parentId: "t7", name: "Work", kind: "folder", created: null, modified: null, sizeBytes: null },
  { id: "t9", parentId: "t8", name: "ProjectAlpha", kind: "folder", created: null, modified: null, sizeBytes: null },
  { id: "t10", parentId: "t9", name: "Proposal.docx", kind: "file", created: "2024-05-01", modified: "2024-05-10", sizeBytes: 200 * 1024 },
  { id: "t11", parentId: "t9", name: "Timeline.xlsx", kind: "file", created: "2024-05-02", modified: "2024-05-11", sizeBytes: 800 * 1024 },
];
