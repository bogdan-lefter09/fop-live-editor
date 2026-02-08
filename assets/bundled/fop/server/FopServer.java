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
        // Create FOP factory with default configuration using absolute base URI
        File baseDir = new File(System.getProperty("user.dir"));
        fopFactory = FopFactory.newInstance(baseDir.toURI());
        
        // Create transformer factory
        transformerFactory = TransformerFactory.newInstance();
        
        // Disable external entity resolution for security
        transformerFactory.setFeature("http://javax.xml.XMLConstants/feature/secure-processing", true);
        
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
            File workingDirectory = null;
            if (cmd.workingDir != null) {
                workingDirectory = new File(cmd.workingDir);
                if (workingDirectory.exists() && workingDirectory.isDirectory()) {
                    System.setProperty("user.dir", cmd.workingDir);
                }
            }
            
            // Create FOP user agent
            FOUserAgent foUserAgent = fopFactory.newFOUserAgent();
            
            // Create FOP instance
            Fop fop = fopFactory.newFop(MimeConstants.MIME_PDF, foUserAgent, pdfOutputStream);
            
            // Setup XSLT transformer with proper URIResolver
            Source xsltSource = new StreamSource(xslFile);
            xsltSource.setSystemId(xslFile.toURI().toString());
            
            Transformer transformer = transformerFactory.newTransformer(xsltSource);
            
            // Set URI resolver for the transformer to resolve relative imports
            if (workingDirectory != null) {
                final File baseDir = workingDirectory;
                transformer.setURIResolver(new javax.xml.transform.URIResolver() {
                    public Source resolve(String href, String base) throws TransformerException {
                        try {
                            File resolvedFile = new File(baseDir, href);
                            if (!resolvedFile.exists()) {
                                resolvedFile = new File(href);
                            }
                            if (resolvedFile.exists()) {
                                StreamSource source = new StreamSource(resolvedFile);
                                source.setSystemId(resolvedFile.toURI().toString());
                                return source;
                            }
                        } catch (Exception e) {
                            // Fall through to default resolution
                        }
                        return null;
                    }
                });
            }
            
            // Setup input XML
            Source xmlSource = new StreamSource(xmlFile);
            xmlSource.setSystemId(xmlFile.toURI().toString());
            
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
            String errorMessage = e.getMessage();
            String errorClass = e.getClass().getName();
            
            // Build detailed error message
            StringBuilder detailedError = new StringBuilder();
            detailedError.append("PDF generation failed: ");
            detailedError.append(errorClass).append(": ");
            detailedError.append(errorMessage != null ? errorMessage : "Unknown error");
            
            // Check for common issues
            if (errorMessage != null) {
                if (errorMessage.contains("not a valid object reference")) {
                    detailedError.append("\n\nPossible cause: FOP configuration or resource resolution issue.");
                    detailedError.append("\nMake sure all XSL imports use correct paths relative to the XSL folder.");
                } else if (errorMessage.contains("Cannot find")) {
                    detailedError.append("\n\nPossible cause: Missing file or resource in XSL transformation.");
                }
            }
            
            sendError(detailedError.toString(), getStackTrace(e), cmd.requestId);
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
