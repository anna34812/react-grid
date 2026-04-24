import React from 'react';
import { COLUMN_SIZE_MODE, DataGrid, DEFAULT_ROW_SELECTION } from './DataGrid';
import { TreeDataGrid } from './TreeDataGrid';

const IXGrid = (props) => {
  const { columns, dataSource, fetchData, treeData = false, onReady, onQueryChange = () => {}, loading = false } = props;
  const { resetPaginationTrigger } = props;
  const { paginationMode = 'server' } = props; // pagination
  const { rowSelection = { ...DEFAULT_ROW_SELECTION, mode: 'multi', checkboxes: true, enableClickSelection: false }, onSelectionChange = () => {} } = props;
  const { columnSizeMode = COLUMN_SIZE_MODE.FIT_DATA } = props; // column size mode
  const { enableColumnReorder = false, enableRowDrag = false, onEditedRowsChange = () => {}, enableFiltering = true, LoadingComponent, EmptyComponent } = props;

  return (
    <div>
      {treeData ? (
        <TreeDataGrid columns={columns} dataSource={dataSource} treeData={treeData?.config} enableColumnReorder={enableColumnReorder} rowSelection={rowSelection} onSelectionChange={onSelectionChange} enableFiltering={enableFiltering} LoadingComponent={LoadingComponent} EmptyComponent={EmptyComponent} />
      ) : (
        <DataGrid
          dataSource={dataSource}
          fetchData={fetchData}
          loading={loading}
          onReady={onReady}
          onQueryChange={onQueryChange}
          resetPaginationTrigger={resetPaginationTrigger}
          columnSizeMode={columnSizeMode}
          paginationMode={paginationMode}
          columns={columns}
          enableColumnReorder={enableColumnReorder}
          enableRowDrag={enableRowDrag}
          rowSelection={rowSelection}
          onSelectionChange={onSelectionChange}
          onEditedRowsChange={onEditedRowsChange}
          enableFiltering={enableFiltering}
          LoadingComponent={LoadingComponent}
          EmptyComponent={EmptyComponent}
        />
      )}
    </div>
  );
};
export default IXGrid;
