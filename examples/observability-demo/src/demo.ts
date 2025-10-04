import { observability } from '@hautech/obs-sdk';

async function simulateAgentWorkflow() {
  console.log('🚀 Starting agent workflow simulation...');
  
  // Initialize the SDK
  observability.init({
    mode: 'extended',
    endpoint: 'http://localhost:3001',
    defaultAttributes: {
      environment: 'demo',
      version: '1.0.0',
    },
  });

  try {
    // Simulate a high-level agent task
    await observability.withSpan(
      { 
        label: 'Agent: Process User Request',
        attributes: { 
          userId: 'user123',
          requestType: 'data_analysis'
        }
      },
      async () => {
        console.log('📋 Agent received user request');
        
        // Simulate data retrieval step
        await observability.withSpan(
          { 
            label: 'Tool: Fetch Data',
            attributes: { 
              dataSource: 'database',
              query: 'SELECT * FROM analytics'
            }
          },
          async () => {
            console.log('  📊 Fetching data from database...');
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('  ✅ Data retrieved successfully');
          }
        );

        // Simulate AI model processing
        await observability.withSpan(
          { 
            label: 'LLM: Analyze Data',
            attributes: { 
              model: 'gpt-4',
              tokenCount: 1500,
              temperature: 0.7
            }
          },
          async () => {
            console.log('  🤖 Processing data with LLM...');
            
            // Simulate multiple reasoning steps
            await observability.withSpan(
              { label: 'LLM: Extract Patterns' },
              async () => {
                console.log('    🔍 Extracting patterns...');
                await new Promise(resolve => setTimeout(resolve, 800));
              }
            );
            
            await observability.withSpan(
              { label: 'LLM: Generate Insights' },
              async () => {
                console.log('    💡 Generating insights...');
                await new Promise(resolve => setTimeout(resolve, 600));
              }
            );
            
            console.log('  ✅ Analysis complete');
          }
        );

        // Simulate report generation
        await observability.withSpan(
          { 
            label: 'Tool: Generate Report',
            attributes: { 
              format: 'pdf',
              pages: 5
            }
          },
          async () => {
            console.log('  📄 Generating report...');
            await new Promise(resolve => setTimeout(resolve, 300));
            console.log('  ✅ Report generated');
          }
        );

        console.log('🎉 Agent workflow completed successfully');
        return { 
          status: 'success',
          reportId: 'report_123',
          insights: ['Trend identified', 'Anomaly detected', 'Recommendation ready']
        };
      }
    );

  } catch (error) {
    console.error('❌ Workflow failed:', error);
  }

  // Demonstrate error handling
  console.log('\n🔄 Simulating error scenario...');
  try {
    await observability.withSpan(
      { 
        label: 'Agent: Handle Error Case',
        attributes: { scenario: 'network_failure' }
      },
      async () => {
        await observability.withSpan(
          { 
            label: 'Tool: External API Call',
            attributes: { endpoint: 'https://api.external.com/data' }
          },
          async () => {
            console.log('  🌐 Calling external API...');
            await new Promise(resolve => setTimeout(resolve, 200));
            throw new Error('Network timeout after 5 seconds');
          }
        );
      }
    );
  } catch (error) {
    console.log('  ⚠️  Error handled gracefully:', error.message);
  }

  // Flush any pending data
  await observability.flush();
  console.log('\n✨ Demo completed! Check the observability server for span data.');
}

async function main() {
  try {
    await simulateAgentWorkflow();
  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

main();