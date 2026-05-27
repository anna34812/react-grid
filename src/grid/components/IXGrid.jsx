import React, { useMemo } from 'react';
import { COLUMN_SIZE_MODE, DataGrid } from './DataGrid';
import { TreeDataGrid } from './TreeDataGrid';
import { mergeRowSelection } from '../utils/rowSelection';

/** Applied when `rowSelection` is omitted or partially overridden on `IXGrid`. */
const IXGRID_ROW_SELECTION_DEFAULTS = { mode: 'multi', checkboxes: true, enableClickSelection: false };

const IXGrid = (props) => {
  const { columns, dataSource, fetchData, treeData = false, onReady, onQueryChange = () => {}, loading = false } = props;
  const { resetPaginationTrigger } = props;
  const { paginationMode = 'server' } = props; // pagination
  const { rowSelection: rowSelectionProp, onSelectionChange = () => {} } = props;
  const rowSelection = useMemo(() => mergeRowSelection({ ...IXGRID_ROW_SELECTION_DEFAULTS, ...rowSelectionProp }), [rowSelectionProp]);
  const { columnSizeMode = COLUMN_SIZE_MODE.FIT_DATA } = props; // column size mode
  const { enableColumnReorder = false, enableRowDrag = false, onEditedRowsChange = () => {}, enableFiltering = true, enableColumnPinning = false, LoadingComponent, EmptyComponent } = props;

  return (
    <div>
      {treeData ? (
        <TreeDataGrid columns={columns} dataSource={dataSource} treeData={treeData?.config} enableColumnReorder={enableColumnReorder} rowSelection={rowSelection} onSelectionChange={onSelectionChange} enableFiltering={enableFiltering} enableColumnPinning={enableColumnPinning} LoadingComponent={LoadingComponent} EmptyComponent={EmptyComponent} />
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
          enableColumnPinning={enableColumnPinning}
          LoadingComponent={LoadingComponent}
          EmptyComponent={EmptyComponent}
        />
      )}
    </div>
  );
};
export default IXGrid;
