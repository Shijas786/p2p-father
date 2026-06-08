import React, { memo } from 'react';
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets';

function TradingViewChartComponent() {
  return (
    <div style={{ height: "100%", width: "100%", position: "absolute", top: 0, left: 0 }}>
      <AdvancedRealTimeChart
        symbol="BINANCE:BTCUSDT"
        theme="dark"
        interval="5"
        autosize
        allow_symbol_change={false}
        hide_legend
        hide_top_toolbar
        hide_side_toolbar
        save_image={false}
      />
    </div>
  );
}

export const TradingViewChart = memo(TradingViewChartComponent);
