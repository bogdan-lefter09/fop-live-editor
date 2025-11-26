import org.apache.fop.apps.*;
import org.apache.fop.apps.io.ResourceResolverFactory;
import javax.xml.transform.*;
import javax.xml.transform.sax.SAXResult;
import javax.xml.transform.stream.StreamSource;
import java.io.*;
import java.nio.file.*;
import com.google.gson.*;

/**
 * FOP Server - Keeps FOP instance alive and processes PDF generation requests via stdin/stdout
 * Communication protocol: JSON messages on stdin, responses on stdout
 */
public class FopServer {
    private static final Gson gson = new Gson();
    private static FopFactory fopFactory;
    private static TransformerFactory transformerFactory;
    
    public static void main(String[] args) {
        try {
            // Initialize FOP factory once
            initializeFop();
            
            // Signal ready
            sendResponse(new Response("ready", "FOP Server initialized and ready", null, null));
            
            // Process commands from stdin
            BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
            String line;
            
            while ((line = reader.readLine()) != null) {
                try {
                    processCommand(line);
                } catch (Exception e) {
                    sendError("Command processing error: " + e.getMessage(), getStackTrace(e), 0);
                }
            }
        } catch (Exception e) {
            sendError("Fatal error: " + e.getMessage(), getStackTrace(e), 0);
            System.exit(1);
        }
    }
    
    private static void initializeFop() throws Exception {
        // Create FOP factory with default configuration
        fopFactory = FopFactory.newInstance(new File(".").toURI());
        
        // Create transformer factory
        transformerFactory = TransformerFactory.newInstance();
        
        // Try to set attributes (may not be supported by all implementations)
        try {
            transformerFactory.setAttribute("http://javax.xml.XMLConstants/property/accessExternalStylesheet", "all");
        } catch (IllegalArgumentException e) {
            // Ignore if not supported
        }
        try {
            transformerFactory.setAttribute("http://javax.xml.XMLConstants/property/accessExternalSchema", "all");
        } catch (IllegalArgumentException e) {
            // Ignore if not supported
        }
    }
    
    private static void processCommand(String jsonCommand) {
        try {
            Command cmd = gson.fromJson(jsonCommand, Command.class);
            
            if ("generate".equals(cmd.action)) {
                generatePdf(cmd);
            } else if ("ping".equals(cmd.action)) {
                Response resp = new Response("pong", "Server is alive", null, null);
                resp.requestId = cmd.requestId;
                sendResponse(resp);
            } else if ("shutdown".equals(cmd.action)) {
                Response resp = new Response("shutdown", "Shutting down", null, null);
                resp.requestId = cmd.requestId;
                sendResponse(resp);
                System.exit(0);
            } else {
                sendError("Unknown action: " + cmd.action, null, cmd.requestId);
            }
        } catch (JsonSyntaxException e) {
            sendError("Invalid JSON: " + e.getMessage(), getStackTrace(e), 0);
        }
    }
    
    private static void generatePdf(Command cmd) {
        long startTime = System.currentTimeMillis();
        ByteArrayOutputStream pdfOutputStream = new ByteArrayOutputStream();
        
        try {
            // Validate inputs
            if (cmd.xmlPath == null || cmd.xslPath == null || cmd.outputPath == null) {
                sendError("Missing required parameters: xmlPath, xslPath, or outputPath", null, cmd.requestId);
                return;
            }
            
            File xmlFile = new File(cmd.xmlPath);
            File xslFile = new File(cmd.xslPath);
            
            if (!xmlFile.exists()) {
                sendError("XML file not found: " + cmd.xmlPath, null, cmd.requestId);
                return;
            }
            if (!xslFile.exists()) {
                sendError("XSL file not found: " + cmd.xslPath, null, cmd.requestId);
                return;
            }
            
            // Set working directory if provided (for relative imports in XSL)
            if (cmd.workingDir != null) {
                System.setProperty("user.dir", cmd.workingDir);
            }
            
            // Create FOP user agent
            FOUserAgent foUserAgent = fopFactory.newFOUserAgent();
            
            // Create FOP instance
            Fop fop = fopFactory.newFop(MimeConstants.MIME_PDF, foUserAgent, pdfOutputStream);
            
            // Setup XSLT transformer
            Source xsltSource = new StreamSource(xslFile);
            Transformer transformer = transformerFactory.newTransformer(xsltSource);
            
            // Setup input XML
            Source xmlSource = new StreamSource(xmlFile);
            
            // Setup output (FOP SAXResult)
            Result result = new SAXResult(fop.getDefaultHandler());
            
            // Transform and generate PDF
            transformer.transform(xmlSource, result);
            
            // Get PDF bytes
            byte[] pdfBytes = pdfOutputStream.toByteArray();
            
            // Write to output file
            Files.write(Paths.get(cmd.outputPath), pdfBytes);
            
            long duration = System.currentTimeMillis() - startTime;
            
            // Send success response with PDF data
            Response response = new Response(
                "success",
                "PDF generated successfully in " + duration + "ms",
                cmd.outputPath,
                pdfBytes
            );
            response.requestId = cmd.requestId;
            sendResponse(response);
            
        } catch (Exception e) {
            sendError("PDF generation failed: " + e.getMessage(), getStackTrace(e), cmd.requestId);
        } finally {
            try {
                pdfOutputStream.close();
            } catch (IOException ignored) {}
        }
    }
    
    private static void sendResponse(Response response) {
        // Send response as JSON to stdout
        // Use a delimiter to separate messages
        String json = gson.toJson(response);
        System.out.println("RESPONSE:" + json);
        System.out.flush();
    }
    
    private static void sendError(String message, String stackTrace, int requestId) {
        Response response = new Response("error", message, null, null);
        response.stackTrace = stackTrace;
        response.requestId = requestId;
        sendResponse(response);
    }
    
    private static String getStackTrace(Exception e) {
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        e.printStackTrace(pw);
        return sw.toString();
    }
    
    // Command structure
    static class Command {
        String action;
        String xmlPath;
        String xslPath;
        String outputPath;
        String workingDir;
        int requestId;
    }
    
    // Response structure
    static class Response {
        String status;
        String message;
        String outputPath;
        byte[] pdfData;
        String stackTrace;
        int requestId;
        
        Response(String status, String message, String outputPath, byte[] pdfData) {
            this.status = status;
            this.message = message;
            this.outputPath = outputPath;
            this.pdfData = pdfData;
        }
    }
}
